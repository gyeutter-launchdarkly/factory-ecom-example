#!/usr/bin/env bash
# Mirror the demo's terminal into the browser.
#
# The menu re-execs itself inside a tmux session, and ttyd serves a read-only
# attachment to that same session on a local port. The pane iframes it, so the
# audience watches the real terminal — the menu, the progress bar, the errors —
# under the flowchart, and the presenter still drives it from their own window
# with ctrl-c and everything else working normally.
#
# Input from the browser is forwarded, because the useful things there are mouse
# events: the wheel scrolls tmux's history and a drag copies to the clipboard. A
# read-only tmux client discards mouse along with keys, so a locked-down mirror
# cannot be scrolled or selected from at all. FACTORY_TTY_READONLY=1 locks it if
# you would rather have a pane nobody can touch.
#
# Everything runs on a PRIVATE tmux socket (tmux -L), so the demo's options and
# key bindings — status bar off, mouse on, copy-on-select — never touch a
# personal tmux config on the default socket, and quitting cannot disturb it.
#
# Everything here is optional. Without tmux and ttyd installed the demo behaves
# exactly as it did before; the pane falls back to its console panel.

TTY_SESSION="${FACTORY_TTY_SESSION:-autofactory}"
TTY_SOCKET="${FACTORY_TTY_SOCKET:-autofactory}"
# ttyd runs in its own tmux session rather than as a plain background process:
# the tmux server is already a daemon, so the web terminal outlives the shell
# that started it instead of dying with it.
TTY_SERVER_SESSION="${TTY_SESSION}-web"
TTY_PORT="${FACTORY_TTY_PORT:-7681}"

# Every tmux call goes through the private socket.
TM() { tmux -L "$TTY_SOCKET" "$@"; }

# ttyd binds every interface by default, which would put the demo terminal on
# the local network. Loopback only; the browser is on this machine.
tty_loopback() { [[ "$(uname -s)" == "Darwin" ]] && echo "lo0" || echo "lo"; }

# System clipboard writer, so a mouse selection lands where paste expects it.
# Empty on a box with none of them; copy-on-select then just no-ops.
tty_clipboard_cmd() {
  if command -v pbcopy >/dev/null 2>&1; then echo "pbcopy"
  elif command -v wl-copy >/dev/null 2>&1; then echo "wl-copy"
  elif command -v xclip >/dev/null 2>&1; then echo "xclip -selection clipboard -in"
  elif command -v xsel >/dev/null 2>&1; then echo "xsel --clipboard --input"
  fi
}

tty_supported() {
  [[ "${FACTORY_TTY:-1}" == "1" ]] || return 1
  command -v tmux >/dev/null 2>&1 && command -v ttyd >/dev/null 2>&1
}

tty_running() {
  command -v tmux >/dev/null 2>&1 && TM has-session -t "$TTY_SERVER_SESSION" 2>/dev/null
}

# The browser viewer must not decide how big the session is. tmux sizes a window
# to whichever client acted most recently, and the browser is a client like any
# other: one reporting 140x14 resized the session under the presenter, squashing
# the menu into 14 rows and leaving a 92-column terminal showing a slice of a
# 140-column window — which reads as a blank screen.
#
# ignore-size (tmux 3.2+) is exactly this: the client sees the window but is not
# counted when sizing it. Preferred over pinning the window, because pinning
# would also stop the presenter's own terminal from resizing it.
tty_attach_flags_supported() {
  local v
  v=$(tmux -V 2>/dev/null | sed -n 's/^tmux \([0-9][0-9]*\)\.\([0-9][0-9]*\).*/\1 \2/p')
  [[ -n "$v" ]] || return 1
  # shellcheck disable=SC2086
  set -- $v
  (( $1 > 3 || ( $1 == 3 && $2 >= 2 ) ))
}

# Selecting with the mouse copies straight to the system clipboard (and keeps
# the selection). Applied per socket, so it is scoped to the demo. set-clipboard
# also lets ttyd/xterm mirror it into the browser's clipboard over OSC 52.
tty_apply_options() {
  TM set -g status off >/dev/null 2>&1 || true
  TM set -g mouse on >/dev/null 2>&1 || true
  TM set -g history-limit 20000 >/dev/null 2>&1 || true
  TM set -g set-clipboard on >/dev/null 2>&1 || true

  local clip; clip=$(tty_clipboard_cmd)
  [[ -z "$clip" ]] && return 0
  # copy-command backs the default mouse-drag binding; the explicit binds cover
  # tmux builds where the default does not consult it.
  TM set -g copy-command "$clip" >/dev/null 2>&1 || true
  TM bind -T copy-mode    MouseDragEnd1Pane send -X copy-pipe-no-clear "$clip" >/dev/null 2>&1 || true
  TM bind -T copy-mode-vi MouseDragEnd1Pane send -X copy-pipe-no-clear "$clip" >/dev/null 2>&1 || true
}

# Serve the session. Safe to call repeatedly: a live server is left alone.
tty_serve() {
  tty_supported || return 1
  tty_running && return 0

  if /usr/bin/curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:${TTY_PORT}" 2>/dev/null; then
    echo "  note: port ${TTY_PORT} is already serving something; not starting ttyd." >&2
    return 1
  fi

  # ignore-size in both modes: the browser may drive the mouse, never the size.
  local flags="ignore-size" writable="-W"
  if [[ "${FACTORY_TTY_READONLY:-0}" == "1" ]]; then
    flags="read-only,ignore-size"
    writable=""
  fi

  local attach_flags="-f ${flags}"
  if ! tty_attach_flags_supported; then
    # Pre-3.2 has no -f, so the window is pinned instead to stop the viewer
    # squashing it. The presenter's resizes stop being followed, which is the
    # lesser problem.
    attach_flags=""
    [[ -n "$writable" ]] || attach_flags="-r"
    TM set -g window-size manual >/dev/null 2>&1 || true
  fi

  # ttyd's argv is written to a script rather than assembled into the string
  # tmux runs. That string passes through two levels of word splitting, and it
  # quietly ate both the theme's `=` and the trailing attach flags — leaving a
  # mirror that could still resize the presenter's session. A file has exactly
  # the arguments it appears to have, and `cat` shows what is running.
  local runner=".autofactory/.ttyd-run.sh"
  mkdir -p .autofactory
  {
    echo '#!/usr/bin/env bash'
    echo '# Generated by demo/lib/tty.sh. Safe to delete; rewritten on each start.'
    echo 'exec ttyd \'
    printf '  -p %q -i %q %s \\\n' "$TTY_PORT" "$(tty_loopback)" "$writable"
    printf '  -t %q \\\n' 'fontSize=13'
    printf '  -t %q \\\n' 'theme={"background":"#131010","foreground":"#F3EEEA","cursor":"#E9A79B"}'
    printf '  tmux -L %q attach -t %q %s\n' "$TTY_SOCKET" "$TTY_SESSION" "$attach_flags"
  } >"$runner"

  TM new-session -d -s "$TTY_SERVER_SESSION" "bash $runner" 2>/dev/null || return 1

  # ttyd exits immediately on a bad port or a missing session, taking its tmux
  # session with it, so a moment later has-session is an honest health check.
  sleep 1
  tty_running
}

tty_stop() {
  command -v tmux >/dev/null 2>&1 || return 0
  # Kill the whole private server: it holds only the demo's own sessions.
  TM kill-server 2>/dev/null || true
}

# Re-exec the caller inside tmux, then serve it. Call before any output: the
# process is replaced, so nothing printed first would survive anyway.
#
# `new-session` on the private socket, joined by a second `make menu` if one is
# already there, so a rerun attaches instead of starting a rival demo.
tty_wrap() {
  [[ -z "${TMUX:-}" ]] || return 0
  tty_supported || return 0
  [[ -t 0 && -t 1 ]] || return 0

  # FACTORY_TTY=0 in the command itself, rather than tmux -e: the environment a
  # session inherits depends on the tmux version, and re-wrapping would fork the
  # demo into a session inside a session.
  local cmd
  cmd=$(printf '%q ' "$@")

  # Born at the presenter's size, so the first draw is correct rather than an
  # 80x24 default that a resize has to repair.
  local cols rows
  cols=$(tput cols 2>/dev/null || echo 120)
  rows=$(tput lines 2>/dev/null || echo 30)

  TM new-session -d -x "$cols" -y "$rows" -s "$TTY_SESSION" "FACTORY_TTY=0 ${cmd}" 2>/dev/null \
    || TM new-session -d -s "$TTY_SESSION" "FACTORY_TTY=0 ${cmd}" 2>/dev/null \
    || TM has-session -t "$TTY_SESSION" 2>/dev/null \
    || return 0
  tty_apply_options
  tty_serve || true

  exec tmux -L "$TTY_SOCKET" attach -t "$TTY_SESSION"
}

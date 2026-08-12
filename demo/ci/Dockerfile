FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    jq \
  && rm -rf /var/lib/apt/lists/*

# Install act — local GitHub Actions runner.
# TARGETARCH is supplied by BuildKit (amd64 | arm64); act names its x86 asset
# "x86_64", so map that one. Without this the image gets an x86_64 binary on
# Apple Silicon and fails at runtime with "exec format error".
ARG ACT_VERSION=0.2.89
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) ACT_ARCH=x86_64 ;; \
      arm64) ACT_ARCH=arm64  ;; \
      *) echo "unsupported arch: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL --retry 5 --retry-delay 2 --retry-all-errors \
      "https://github.com/nektos/act/releases/download/v${ACT_VERSION}/act_Linux_${ACT_ARCH}.tar.gz" \
      | tar -xz -C /usr/local/bin act; \
    act --version

ENTRYPOINT ["/usr/local/bin/act"]

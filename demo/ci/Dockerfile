FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    jq \
  && rm -rf /var/lib/apt/lists/*

# Install act — local GitHub Actions runner
ARG ACT_VERSION=0.2.60
RUN curl -fsSL \
    "https://github.com/nektos/act/releases/download/v${ACT_VERSION}/act_Linux_x86_64.tar.gz" \
    | tar -xz -C /usr/local/bin act

ENTRYPOINT ["/usr/local/bin/act"]

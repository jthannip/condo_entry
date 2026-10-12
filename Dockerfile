FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# curl lets the dialplan send unlock/call events to the Node.js api
RUN apt-get update \
    && apt-get install -y --no-install-recommends asterisk curl \
    && rm -rf /var/lib/apt/lists/*

# Run Asterisk in the foreground with verbose logging
CMD ["asterisk", "-f", "-vvv"]

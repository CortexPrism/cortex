FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install X11 and GUI dependencies
RUN apt-get update && apt-get install -y \
    # X11 virtual frame buffer and utilities
    xvfb \
    x11-utils \
    x11-xserver-utils \
    xdotool \
    # Screenshot utilities
    scrot \
    imagemagick \
    # Desktop environment
    xfce4 \
    xfce4-terminal \
    # Browsers
    firefox \
    chromium-browser \
    # Common applications
    libreoffice \
    gedit \
    # Utilities
    curl \
    wget \
    git \
    unzip \
    # Fonts for better rendering
    fonts-liberation \
    fonts-dejavu-core \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# Set display environment
ENV DISPLAY=:99

# Create workspace
WORKDIR /workspace

# Create a startup script
RUN echo '#!/bin/bash\n\
Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &\n\
sleep 2\n\
exec "$@"\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

# Default command: keep container running
CMD ["sleep", "infinity"]

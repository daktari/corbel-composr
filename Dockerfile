FROM node:4.3.0
# Author / Maintainer
MAINTAINER Composr Team <support-composr@bq.com>

WORKDIR /src

# Copy app source
COPY . /src

# Install packages
RUN apt-get update && \
 apt-get install -y net-tools && \
 apt-get clean && \
 rm -rf /var/lib/apt/lists/*

# Install dev dependencies
RUN npm install; npm rebuild; npm install -g bunyan

ENV PATH node_modules/pm2/bin:$PATH

# Global config environment variable

ENV URL_BASE='' \
    RABBITMQ_HOST='' \
    RABBITMQ_PASSWORD='' \
    RABBITMQ_FORCE_CONNECT=true \
    RABBITMQ_HEARTBEAT=30 \
    CREDENTIALS_CLIENT_ID='' \
    CREDENTIALS_CLIENT_SECRET='' \
    CREDENTIALS_SCOPES='' \
    LOG_LEVEL='debug' \
    LOG_FILE='' \
    ACCESS_LOG_FILE='' \
    RABBITMQ_PORT='' \
    RABBITMQ_USERNAME='' \
    ACCESS_LOG=true \
    NRACTIVE=false \
    NRAPPNAME='' \
    NRAPIKEY='' \
    NODE_ENV='production' \
    BUNYAN_LOG=true \
    PORT=3000

# Expose port
EXPOSE $PORT

# Enable corbel-composr
CMD npm start

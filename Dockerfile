# Build a Linux graph inside the image; the local macOS cache is not copied.
FROM --platform=linux/amd64 alpine:3.22
RUN apk add --no-cache ca-certificates curl tar bzip2 libstdc++ libgcc
WORKDIR /data
RUN curl --fail --location --retry 3 -o /tmp/motis.tar.bz2 https://github.com/motis-project/motis/releases/download/v2.11.4/motis-linux-amd64.tar.bz2 \
 && echo 'b521bb29c961a3b994ff4dac663778ba64fee7b4cfaf3f2b20ff1d5e1d15e0dc  /tmp/motis.tar.bz2' | sha256sum -c - \
 && tar -xjf /tmp/motis.tar.bz2 -C /usr/local/bin \
 && rm /tmp/motis.tar.bz2
COPY var/motis/feeds/ ./feeds/
COPY var/motis/haute-savoie.osm.pbf ./haute-savoie.osm.pbf
COPY var/motis/elevation/ ./elevation/
COPY var/motis/config.yml ./config.yml
RUN sed -i 's/host: 127.0.0.1/host: 0.0.0.0/' config.yml && motis import
EXPOSE 8080
CMD ["motis", "server"]

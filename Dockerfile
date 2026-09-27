FROM litespeedtech/openlitespeed:latest

# Replace the base image's httpd_config.conf (which declares an "Example"
# vhost and several Rails/Node templates we don't need) with a minimal
# one that declares a single vhost called "ps1" wired to a single
# Default listener on port 80.
#
# The per-vhost config (vhconf.conf) is NOT copied here — it is
# bind-mounted at runtime from ./config/openlitespeed/ on the host so
# vhost edits don't require an image rebuild.
COPY config/openlitespeed/httpd_config.conf /usr/local/lsws/conf/httpd_config.conf
COPY config/openlitespeed/vhconf.conf       /usr/local/lsws/conf/vhosts/ps1/vhconf.conf

EXPOSE 80
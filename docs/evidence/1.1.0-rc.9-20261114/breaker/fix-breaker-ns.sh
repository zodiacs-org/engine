#!/usr/bin/env bash
# Run a command in a mount namespace without the machine's root-owned
# /node_modules (the archive-binding check refuses a TMPDIR below one), with
# the Node of NODE_BIN first on PATH and TMPDIR set to NS_TMPDIR.
#   NODE_BIN=<node>/bin NS_TMPDIR=/tmp/<dir> bash fix-breaker-ns.sh <command> [arguments]
: "${NODE_BIN:?}" "${NS_TMPDIR:?}"
args=""
for d in /*; do case $d in /node_modules|/proc|/dev|/tmp) ;; *) args="$args --bind $d $d";; esac; done
exec bwrap $args --proc /proc --dev /dev --bind /tmp /tmp env -u NODE_OPTIONS -u NODE_PATH TMPDIR="$NS_TMPDIR" PATH="$NODE_BIN:/usr/bin:/bin" "$@"

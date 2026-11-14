#!/usr/bin/env bash
# Run a command in a mount namespace without the machine's root-owned
# /node_modules, with the Node of NODE_BIN first on PATH and TMPDIR set to
# NS_TMPDIR (a directory outside the checkout, below /tmp).
#   NODE_BIN=<node>/bin NS_TMPDIR=/tmp/<dir> bash breaker-ns.sh <command> [arguments]
: "${NODE_BIN:?}" "${NS_TMPDIR:?}"
args=""
for d in /*; do case $d in /node_modules|/proc|/dev|/tmp) ;; *) args="$args --bind $d $d";; esac; done
exec bwrap $args --proc /proc --dev /dev --bind /tmp /tmp env TMPDIR="$NS_TMPDIR" PATH="$NODE_BIN:/usr/bin:/bin" "$@"

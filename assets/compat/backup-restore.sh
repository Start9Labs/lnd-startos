#!/bin/sh

compat duplicity restore /mnt/backup /root/.lnd
mkdir -p /root/.lnd/start9
touch /root/.lnd/start9/restore.yaml
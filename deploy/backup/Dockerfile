# Shubayr backups: pg_dump + picture sync to an off-server rclone target,
# on a daily schedule (crond), with restore. See docs/deploy/production.md.
FROM alpine:3.20
RUN apk add --no-cache bash coreutils curl tzdata postgresql16-client rclone
COPY --chmod=0755 entrypoint.sh backup.sh restore.sh health.sh target-size.sh heartbeat.sh /usr/local/bin/
ENV TZ=Asia/Baghdad \
    BACKUP_SCHEDULE="30 3 * * *" \
    BACKUP_RETENTION_DAYS=14 \
    BACKUP_TARGET_WARN_GB=8 \
    BACKUP_HEARTBEAT_URL="" \
    BACKUP_HEARTBEAT_FAIL_SUFFIX=""
VOLUME ["/backups"]
HEALTHCHECK --interval=1h --timeout=10s --start-period=1m CMD ["/usr/local/bin/health.sh"]
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["schedule"]

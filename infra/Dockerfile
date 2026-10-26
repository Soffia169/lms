# syntax=docker/dockerfile:1.7
#
# Multi-stage сборка одного сервиса LMS.
# Используется с этапа 1, когда в reactor появляется services/<service>:
#
#   docker build -f infra/Dockerfile --build-arg SERVICE=auth-service -t lms/auth-service .
#
# Контекст сборки — корень репозитория (см. .dockerignore).

ARG BUILD_IMAGE=maven:3.9.9-eclipse-temurin-21
ARG RUNTIME_IMAGE=eclipse-temurin:21-jre

# ---------- build ----------
FROM ${BUILD_IMAGE} AS build

ARG SERVICE

WORKDIR /workspace

# Сначала исходники и POM-ы: слой с зависимостями переиспользуется,
# пока не меняются pom.xml и libs/.
COPY pom.xml ./
COPY libs ./libs
COPY services ./services

RUN --mount=type=cache,target=/root/.m2 \
    test -n "${SERVICE}" \
    && mvn -B -ntp -pl "services/${SERVICE}" -am -Dmaven.test.skip=true package

# ---------- runtime ----------
FROM ${RUNTIME_IMAGE}

ARG SERVICE

LABEL org.opencontainers.image.title="lms-${SERVICE}" \
      org.opencontainers.image.description="LMS ${SERVICE}"

WORKDIR /app

RUN groupadd --system lms \
    && useradd --system --gid lms --home-dir /app lms \
    && mkdir -p /app/keys \
    && chown -R lms:lms /app

COPY --from=build --chown=lms:lms \
     /workspace/services/${SERVICE}/target/${SERVICE}-*.jar /app/app.jar

USER lms

ENV JAVA_OPTS=""

EXPOSE 8080

ENTRYPOINT ["sh", "-c", "exec java ${JAVA_OPTS} -jar /app/app.jar"]

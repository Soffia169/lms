package com.lms.common.events.outbox;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Настройки outbox/relay. */
@ConfigurationProperties(prefix = "lms.events.outbox")
public class OutboxProperties {

    /** Выключить relay (например, в unit-тестах сервиса). */
    private boolean enabled = true;

    /** Сколько записей забирать за один запуск. */
    private int batchSize = 100;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }
}

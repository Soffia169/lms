package com.lms.common.events.outbox;

import com.lms.common.events.EventEnvelope;

/** Публикация готового события во внешнюю шину. */
public interface EventSender {

    void send(EventEnvelope envelope);
}

package com.lms.common.events;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.Declarable;
import org.springframework.amqp.core.Declarables;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;

import java.util.ArrayList;
import java.util.List;

/**
 * Единая RabbitMQ-топология LMS: topic-exchanges, рабочие очереди с DLQ и bindings.
 *
 * <p>Объявляется автоматически всеми сервисами, которые держат на classpath
 * spring-rabbit. Идемпотентно: {@code RabbitAdmin} создаёт недостающее и
 * проверяет совпадение параметров. Отключить можно
 * {@code lms.events.topology-enabled=false}.</p>
 */
@AutoConfiguration
@ConditionalOnClass(RabbitAdmin.class)
@ConditionalOnProperty(prefix = "lms.events", name = "topology-enabled", havingValue = "true",
        matchIfMissing = true)
public class RabbitTopologyConfiguration {

    @Bean
    public Declarables lmsEventTopology() {
        List<Declarable> declarables = new ArrayList<>();

        TopicExchange userEvents = new TopicExchange(EventTopics.USER_EVENTS, true, false);
        TopicExchange courseEvents = new TopicExchange(EventTopics.COURSE_EVENTS, true, false);
        TopicExchange enrollmentEvents = new TopicExchange(EventTopics.ENROLLMENT_EVENTS, true, false);
        TopicExchange assessmentEvents = new TopicExchange(EventTopics.ASSESSMENT_EVENTS, true, false);
        DirectExchange deadLetterExchange = new DirectExchange(RabbitQueues.DLX, true, false);

        declarables.add(userEvents);
        declarables.add(courseEvents);
        declarables.add(enrollmentEvents);
        declarables.add(assessmentEvents);
        declarables.add(deadLetterExchange);

        bind(declarables, RabbitQueues.NOTIFICATION_USER_REGISTERED,
                EventTopics.USER_EVENTS, EventTopics.USER_REGISTERED);
        bind(declarables, RabbitQueues.NOTIFICATION_ENROLLMENT_CREATED,
                EventTopics.ENROLLMENT_EVENTS, EventTopics.ENROLLMENT_CREATED);
        bind(declarables, RabbitQueues.NOTIFICATION_LESSON_COMPLETED,
                EventTopics.ENROLLMENT_EVENTS, EventTopics.LESSON_COMPLETED);

        bind(declarables, RabbitQueues.COURSE_ENROLLMENT_CREATED,
                EventTopics.ENROLLMENT_EVENTS, EventTopics.ENROLLMENT_CREATED);
        bind(declarables, RabbitQueues.COURSE_ENROLLMENT_CANCELLED,
                EventTopics.ENROLLMENT_EVENTS, EventTopics.ENROLLMENT_CANCELLED);

        bind(declarables, RabbitQueues.ENROLLMENT_COURSE_PUBLISHED,
                EventTopics.COURSE_EVENTS, EventTopics.COURSE_PUBLISHED);
        bind(declarables, RabbitQueues.ENROLLMENT_COURSE_UPDATED,
                EventTopics.COURSE_EVENTS, EventTopics.COURSE_UPDATED);

        return new Declarables(declarables);
    }

    private static void bind(List<Declarable> declarables, String queueName, String exchange, String routingKey) {
        Queue queue = QueueBuilder.durable(queueName)
                .withArgument("x-dead-letter-exchange", RabbitQueues.DLX)
                .withArgument("x-dead-letter-routing-key", RabbitQueues.dlq(queueName))
                .build();
        declarables.add(queue);
        declarables.add(new Binding(queueName, Binding.DestinationType.QUEUE, exchange, routingKey, null));

        Queue deadLetterQueue = QueueBuilder.durable(RabbitQueues.dlq(queueName)).build();
        declarables.add(deadLetterQueue);
        declarables.add(new Binding(deadLetterQueue.getName(), Binding.DestinationType.QUEUE,
                RabbitQueues.DLX, RabbitQueues.dlq(queueName), null));
    }
}

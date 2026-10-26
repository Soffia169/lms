package com.lms.common.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Проверяет, что обработчик реально подключён к MVC и отдаёт ProblemDetail.
 */
class GlobalExceptionHandlerMockMvcTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new StubController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void notFoundIsRenderedAsProblemDetail() throws Exception {
        mockMvc.perform(get("/courses/42"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.title").value("Not Found"))
                .andExpect(jsonPath("$.detail").value("Course with id 42 not found"));
    }

    @Test
    void malformedJsonBodyIsRenderedAsProblemDetail() throws Exception {
        mockMvc.perform(post("/things")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").value("Malformed Request"));
    }

    @RestController
    static class StubController {

        @GetMapping("/courses/{id}")
        void course(@PathVariable long id) {
            throw ResourceNotFoundException.of("Course", id);
        }

        @PostMapping("/things")
        void create(@RequestBody Map<String, Object> body) {
            // тело разбирается до вызова метода — ошибка парсинга обрабатывается advice-ом
        }
    }
}

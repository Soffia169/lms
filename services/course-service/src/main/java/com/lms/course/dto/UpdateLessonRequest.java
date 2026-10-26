package com.lms.course.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record UpdateLessonRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 20000) String content,
        @PositiveOrZero Integer position) {
}

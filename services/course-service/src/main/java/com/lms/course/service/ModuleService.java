package com.lms.course.service;

import java.util.UUID;

import com.lms.course.model.Course;
import com.lms.course.model.CourseModule;
import com.lms.course.repository.CourseModuleRepository;
import com.lms.course.dto.CreateLessonRequest;
import com.lms.course.dto.CreateModuleRequest;
import com.lms.course.dto.LessonResponse;
import com.lms.course.dto.ModuleResponse;
import com.lms.course.dto.UpdateModuleRequest;
import com.lms.common.web.ResourceNotFoundException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Сценарии модулей и уроков внутри модуля. Владение проверяется по курсу-владельцу.
 */
@Service
public class ModuleService {

    private final CourseModuleRepository modules;
    private final CourseService courseService;

    public ModuleService(CourseModuleRepository modules, CourseService courseService) {
        this.modules = modules;
        this.courseService = courseService;
    }

    @Transactional
    public ModuleResponse addModule(UUID courseId, CreateModuleRequest request, CurrentUser user) {
        Course course = courseService.requireCourse(courseId);
        CourseAccessGuard.requireManageable(course, user);

        int position = request.position() != null ? request.position() : course.nextModulePosition();
        CourseModule module = course.addModule(request.title().trim(), position);
        return ModuleResponse.from(module);
    }

    @Transactional
    public ModuleResponse updateModule(UUID moduleId, UpdateModuleRequest request, CurrentUser user) {
        CourseModule module = requireModule(moduleId);
        CourseAccessGuard.requireManageable(module.getCourse(), user);

        int position = request.position() != null ? request.position() : module.getPosition();
        module.update(request.title().trim(), position);
        return ModuleResponse.from(module);
    }

    @Transactional
    public void deleteModule(UUID moduleId, CurrentUser user) {
        CourseModule module = requireModule(moduleId);
        CourseAccessGuard.requireManageable(module.getCourse(), user);
        module.getCourse().removeModule(module);
    }

    @Transactional
    public LessonResponse addLesson(UUID moduleId, CreateLessonRequest request, CurrentUser user) {
        CourseModule module = requireModule(moduleId);
        CourseAccessGuard.requireManageable(module.getCourse(), user);

        int position = request.position() != null ? request.position() : module.nextLessonPosition();
        return LessonResponse.from(module.addLesson(request.title().trim(), request.content(), position));
    }

    CourseModule requireModule(UUID moduleId) {
        return modules.findById(moduleId)
                .orElseThrow(() -> ResourceNotFoundException.of("Module", moduleId));
    }
}

import type {
  CreateProjectRequest,
  ProjectDeleteResponse,
  ProjectDetailResponse,
  ProjectItemResponse,
  ProjectListResponse,
  UpdateProjectRequest
} from '@contrix/spec-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendModuleError } from '../common/errors.js';
import { createProjectSchema, projectIdParamsSchema, updateProjectSchema } from './schemas.js';
import { ProjectService } from './service.js';

interface ProjectIdParams {
  id: string;
}

function getProjectService(app: FastifyInstance): ProjectService {
  const db = app.databaseContext.db;

  if (!db) {
    throw new Error('Database is unavailable.');
  }

  return new ProjectService(db);
}

const projectRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, _request, reply) => {
    const validationError = error as { validation?: unknown; message: string };

    if (validationError.validation) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: validationError.message
        }
      });
    }

    return sendModuleError(reply, error, 'PROJECT_INTERNAL_ERROR', 'Unexpected project error');
  });

  app.get('/projects', async (_request, reply) => {
    try {
      const service = getProjectService(app);
      const projects = service.listProjects();

      return reply.send({ projects } satisfies ProjectListResponse);
    } catch (error) {
      return sendModuleError(reply, error, 'PROJECT_INTERNAL_ERROR', 'Unexpected project error');
    }
  });

  app.get<{ Params: ProjectIdParams }>(
    '/projects/:id',
    { schema: projectIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getProjectService(app);
        const detail = service.getProjectDetail(request.params.id);

        return reply.send(detail satisfies ProjectDetailResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'PROJECT_INTERNAL_ERROR', 'Unexpected project error');
      }
    }
  );

  app.post<{ Body: CreateProjectRequest }>(
    '/projects',
    { schema: createProjectSchema },
    async (request, reply) => {
      try {
        const service = getProjectService(app);
        const project = service.createProject(request.body);

        return reply.code(201).send({ project } satisfies ProjectItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'PROJECT_INTERNAL_ERROR', 'Unexpected project error');
      }
    }
  );

  app.put<{ Params: ProjectIdParams; Body: UpdateProjectRequest }>(
    '/projects/:id',
    { schema: { ...projectIdParamsSchema, ...updateProjectSchema } },
    async (request, reply) => {
      try {
        const service = getProjectService(app);
        const project = service.updateProject(request.params.id, request.body);

        return reply.send({ project } satisfies ProjectItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'PROJECT_INTERNAL_ERROR', 'Unexpected project error');
      }
    }
  );

  app.delete<{ Params: ProjectIdParams }>(
    '/projects/:id',
    { schema: projectIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getProjectService(app);
        service.deleteProject(request.params.id);

        return reply.send({ ok: true, id: request.params.id } satisfies ProjectDeleteResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'PROJECT_INTERNAL_ERROR', 'Unexpected project error');
      }
    }
  );
};

export default projectRoutes;

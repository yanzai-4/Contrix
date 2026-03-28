import type {
  CreateGroupRequest,
  GroupDeleteResponse,
  GroupItemResponse,
  GroupListResponse,
  UpdateGroupRequest
} from '@contrix/spec-core';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sendModuleError } from '../common/errors.js';
import { createGroupSchema, groupIdParamsSchema, groupListQuerySchema, updateGroupSchema } from './schemas.js';
import { GroupService } from './service.js';

interface GroupIdParams {
  id: string;
}

interface GroupListQuery {
  projectId?: string;
}

function getGroupService(app: FastifyInstance): GroupService {
  const db = app.databaseContext.db;

  if (!db) {
    throw new Error('Database is unavailable.');
  }

  return new GroupService(db);
}

const groupRoutes: FastifyPluginAsync = async (app) => {
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

    return sendModuleError(reply, error, 'GROUP_INTERNAL_ERROR', 'Unexpected group error');
  });

  app.get<{ Querystring: GroupListQuery }>(
    '/groups',
    { schema: groupListQuerySchema },
    async (request, reply) => {
      try {
        const service = getGroupService(app);
        const groups = service.listGroups(request.query.projectId);

        return reply.send({ groups } satisfies GroupListResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'GROUP_INTERNAL_ERROR', 'Unexpected group error');
      }
    }
  );

  app.post<{ Body: CreateGroupRequest }>(
    '/groups',
    { schema: createGroupSchema },
    async (request, reply) => {
      try {
        const service = getGroupService(app);
        const group = service.createGroup(request.body);

        return reply.code(201).send({ group } satisfies GroupItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'GROUP_INTERNAL_ERROR', 'Unexpected group error');
      }
    }
  );

  app.put<{ Params: GroupIdParams; Body: UpdateGroupRequest }>(
    '/groups/:id',
    { schema: { ...groupIdParamsSchema, ...updateGroupSchema } },
    async (request, reply) => {
      try {
        const service = getGroupService(app);
        const group = service.updateGroup(request.params.id, request.body);

        return reply.send({ group } satisfies GroupItemResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'GROUP_INTERNAL_ERROR', 'Unexpected group error');
      }
    }
  );

  app.delete<{ Params: GroupIdParams }>(
    '/groups/:id',
    { schema: groupIdParamsSchema },
    async (request, reply) => {
      try {
        const service = getGroupService(app);
        service.deleteGroup(request.params.id);

        return reply.send({ ok: true, id: request.params.id } satisfies GroupDeleteResponse);
      } catch (error) {
        return sendModuleError(reply, error, 'GROUP_INTERNAL_ERROR', 'Unexpected group error');
      }
    }
  );
};

export default groupRoutes;

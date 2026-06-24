export interface RequestIdentity {
  type: 'user' | 'instance' | 'anonymous';
  userId?: string;
  username?: string;
  teamIds?: string[];
  currentTeamId?: string;
  sessionId?: string;
  isInstanceAdmin?: boolean;
}

export function createAnonymousIdentity(): RequestIdentity {
  return { type: 'anonymous' };
}

export function createUserIdentity(
  userId: string,
  username: string,
  teamIds: string[],
  currentTeamId?: string,
  isInstanceAdmin = false,
  sessionId?: string,
): RequestIdentity {
  return {
    type: 'user',
    userId,
    username,
    teamIds,
    currentTeamId,
    isInstanceAdmin,
    sessionId,
  };
}

export function createInstanceIdentity(): RequestIdentity {
  return { type: 'instance' };
}

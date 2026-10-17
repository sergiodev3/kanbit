import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { HomeRedirect } from '../features/auth/HomeRedirect';
import { LoginPage } from '../features/auth/LoginPage';
import { ProfilePage } from '../features/auth/ProfilePage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { HealthPage } from '../features/health/HealthPage';
import { GroupDetailPage } from '../features/teacher/GroupDetailPage';
import { GroupsPage } from '../features/teacher/GroupsPage';
import { TeacherBoardPage } from '../features/teacher/TeacherBoardPage';
import { TeamHomePage } from '../features/team/TeamHomePage';
import { RootLayout, type LayoutHandle } from './RootLayout';

/** Board pages use the full screen width; every other page keeps the narrow column. */
const wide: LayoutHandle = { wide: true };

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootLayout,
    children: [
      { path: 'login', Component: LoginPage },
      { path: 'register', Component: RegisterPage },
      { path: 'status', Component: HealthPage },
      {
        element: <RequireAuth />,
        children: [
          { index: true, Component: HomeRedirect },
          { path: 'profile', Component: ProfilePage },
        ],
      },
      {
        element: <RequireAuth role="TEACHER" />,
        children: [
          { path: 'teacher', Component: GroupsPage },
          { path: 'teacher/groups/:groupId', Component: GroupDetailPage },
          { path: 'teacher/teams/:teamId/board', Component: TeacherBoardPage, handle: wide },
        ],
      },
      {
        element: <RequireAuth role="STUDENT" />,
        children: [{ path: 'team', Component: TeamHomePage, handle: wide }],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

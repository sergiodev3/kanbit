import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { HomeRedirect } from '../features/auth/HomeRedirect';
import { LoginPage } from '../features/auth/LoginPage';
import { ProfilePage } from '../features/auth/ProfilePage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { HealthPage } from '../features/health/HealthPage';
import { TeacherHomePage } from '../features/teacher/TeacherHomePage';
import { TeamHomePage } from '../features/team/TeamHomePage';
import { RootLayout } from './RootLayout';

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
        children: [{ path: 'teacher', Component: TeacherHomePage }],
      },
      {
        element: <RequireAuth role="STUDENT" />,
        children: [{ path: 'team', Component: TeamHomePage }],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

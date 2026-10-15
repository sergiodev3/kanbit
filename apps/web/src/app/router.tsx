import { createBrowserRouter } from 'react-router';
import { HealthPage } from '../features/health/HealthPage';
import { RootLayout } from './RootLayout';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [{ index: true, Component: HealthPage }],
  },
]);

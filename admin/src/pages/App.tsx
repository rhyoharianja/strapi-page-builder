import { Route, Routes } from 'react-router-dom';
import { Page } from '@strapi/strapi/admin';

import { Builder } from './Builder';

const App = () => (
  <Routes>
    <Route index element={<Builder />} />
    <Route path="*" element={<Page.Error />} />
  </Routes>
);

export { App };

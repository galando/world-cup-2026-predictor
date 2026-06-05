import { createHashRouter, RouterProvider } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import PreMatchScreen from './screens/PreMatchScreen';
import TeamScreen from './screens/TeamScreen';
import BracketScreen from './screens/BracketScreen';
import TeamPickerScreen from './screens/TeamPickerScreen';
import ScenarioScreen from './screens/ScenarioScreen';
import OfflineBanner from './components/OfflineBanner';
import InstallBanner from './components/InstallBanner';

const router = createHashRouter([
  { path: '/', element: <HomeScreen /> },
  { path: '/match/:matchId', element: <PreMatchScreen /> },
  { path: '/team/:teamCode', element: <TeamScreen /> },
  { path: '/bracket', element: <BracketScreen /> },
  { path: '/scenario', element: <ScenarioScreen /> },
  { path: '/settings', element: <TeamPickerScreen /> },
]);

export default function App() {
  return (
    <>
      <OfflineBanner />
      <InstallBanner />
      <RouterProvider router={router} />
    </>
  );
}

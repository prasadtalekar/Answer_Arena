import React from 'react';
import {createRoot} from 'react-dom/client';
import Arena from '../components/arena';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Arena hostEntrance={window.location.pathname.replace(/\/$/,'')==='/host'}/></React.StrictMode>);

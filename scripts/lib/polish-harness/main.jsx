import { createRoot } from 'react-dom/client';
import '@/index.css';
import '@/styles/brand-tokens.css';
import { SCENARIOS } from './scenarios.jsx';

const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');
const Scenario = SCENARIOS[params.get('s')];
if (!Scenario) throw new Error(`no scenario named ${params.get('s')}`);
createRoot(document.getElementById('root')).render(<Scenario />);

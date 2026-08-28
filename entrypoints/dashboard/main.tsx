import { createRoot } from 'react-dom/client';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <ChakraProvider value={defaultSystem}>
    <App />
  </ChakraProvider>
);

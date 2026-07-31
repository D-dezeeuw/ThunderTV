import { bootstrap } from './app';
import { installSpektrumCspExpressions } from './app/spektrum-csp';

installSpektrumCspExpressions();
void bootstrap();

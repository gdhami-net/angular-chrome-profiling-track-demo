// Same app without the enableProfiling() call, to try the console route:
// open DevTools and run ng.enableProfiling() after the page has loaded.
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

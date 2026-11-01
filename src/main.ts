import { enableProfiling } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Before bootstrap, so the startup work lands on the Angular track too.
enableProfiling();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

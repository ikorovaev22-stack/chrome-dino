// Copyright 2015 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// chrome-dino: trimmed copy of ui/webui/resources/js/util.ts with only the
// helper the error page uses.

import {assert} from './assert.js';

/**
 * Queries for an element that is required to exist.
 */
export function getRequiredElement<T extends HTMLElement = HTMLElement>(
    id: string): T {
  const el = document.querySelector<T>(`#${id}`);
  assert(el);
  assert(el instanceof HTMLElement);
  return el;
}

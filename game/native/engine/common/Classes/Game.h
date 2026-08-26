/****************************************************************************
 Copyright (c) 2018 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You
 shall not use Cocos Creator software for developing other software or tools
 that's used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to
 you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

/**
 * @file Game.h
 * @brief Main application entry point for ET Mini Militia (Cocos Creator native build).
 *
 * This class extends cc::BaseGame to bootstrap the Cocos Creator runtime.
 * It is the first object instantiated by the engine (via CC_REGISTER_APPLICATION
 * in Game.cpp) and is responsible for:
 *   - Setting the native window title
 *   - Enabling the remote JS debugger in debug builds
 *   - Delegating lifecycle events (pause / resume / close) to the engine
 */

#pragma once

#include "cocos/cocos.h"

/**
 * @class Game
 * @brief Concrete application class that Cocos Creator instantiates on launch.
 *
 * Inheritance is public so the engine's dynamic_cast checks work, but the
 * class is intentionally kept minimal — all heavy lifting is done by
 * BaseGame and the JS/TS scripts loaded from assets/.
 */
class Game : public cc::BaseGame {
public:
  Game();

  /**
   * @brief One-time initialisation called by the engine before the main loop.
   *
   * Configures window metadata, the remote debugger (debug builds only),
   * and the XXTEA key used to encrypt bundled scripts.
   * @return 0 on success, non-zero on failure.
   */
  int init() override;

  /** @brief Called when the OS pauses the application (e.g. app switched to background). */
  void onPause() override;

  /** @brief Called when the OS resumes the application after a pause. */
  void onResume() override;

  /** @brief Called when the application is about to be destroyed. */
  void onClose() override;
};

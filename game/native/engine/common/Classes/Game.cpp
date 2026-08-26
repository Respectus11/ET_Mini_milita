/****************************************************************************
 Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

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
 * @file Game.cpp
 * @brief Application bootstrap implementation for ET Mini Militia.
 *
 * Sets up the native window, optional remote debugger, and script encryption
 * key before handing control to the Cocos Creator JS runtime.
 */

#include "Game.h"

// ---------------------------------------------------------------------------
// Default application name shown in the title bar / task switcher.
// Can be overridden at compile time via -DGAME_NAME='"My Game"'.
// ---------------------------------------------------------------------------
#ifndef GAME_NAME
#define GAME_NAME "CocosGame";
#endif

// ---------------------------------------------------------------------------
// XXTEA key used to decrypt bundled JavaScript bytecode.
// Leave empty if scripts are shipped unencrypted (debug / dev builds).
// ---------------------------------------------------------------------------
#ifndef SCRIPT_XXTEAKEY
#define SCRIPT_XXTEAKEY "";
#endif

// ---------------------------------------------------------------------------
// Constructor — default is sufficient; all config happens in init().
// ---------------------------------------------------------------------------
Game::Game() = default;

// ---------------------------------------------------------------------------
// init() — called once by the engine before the main loop starts.
//
// Responsibilities:
//   1. Set the native window title (shown in title bar / app switcher).
//   2. Configure the remote JS debugger (Chrome DevTools) for debug builds.
//   3. Provide the XXTEA key so the runtime can decrypt asset scripts.
//   4. Call BaseGame::init() to let the engine finish its own setup.
// ---------------------------------------------------------------------------
int Game::init() {
  // Window title displayed by the OS (title bar, Alt-Tab, etc.)
  _windowInfo.title = GAME_NAME;

  // Optionally override the default window dimensions here.
  // _windowInfo.height = 600;
  // _windowInfo.width  = 800;

  // --- Remote JS debugger configuration -----------------------------------
  // In debug builds the V8 inspector is exposed so you can attach Chrome
  // DevTools at  chrome://inspect  for live debugging of game scripts.
#if CC_DEBUG
  _debuggerInfo.enabled = true;
#else
  _debuggerInfo.enabled = false;
#endif
  _debuggerInfo.port          = 6086;   // TCP port for the inspector WS
  _debuggerInfo.address       = "0.0.0.0"; // listen on all interfaces (LAN debugging)
  _debuggerInfo.pauseOnStart  = false;  // don't block on debugger attach

  // XXTEA key that the runtime uses to decrypt bundled script files.
  _xxteaKey = SCRIPT_XXTEAKEY;

  // Let BaseGame finish its internal initialisation (creates the window,
  // initialises the renderer, loads the boot script, etc.)
  BaseGame::init();
  return 0;
}

// ---------------------------------------------------------------------------
// Lifecycle callbacks — forward directly to BaseGame which manages the
// underlying engine pause / resume / shutdown sequence.
// ---------------------------------------------------------------------------

/** Pause the engine (stop the game loop, release GPU context if needed). */
void Game::onPause() { BaseGame::onPause(); }

/** Resume the engine after a pause (restart the game loop). */
void Game::onResume() { BaseGame::onResume(); }

/** Clean shutdown — release all resources and exit the process. */
void Game::onClose() { BaseGame::onClose(); }

// ---------------------------------------------------------------------------
// Register this class as the application entry point with the engine.
// The engine's main() will instantiate Game and call init() automatically.
// ---------------------------------------------------------------------------
CC_REGISTER_APPLICATION(Game);

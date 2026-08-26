# ============================================================================
# android/CMakeLists.txt
# Android-specific top-level CMake entry point for ET Mini Militia.
#
# This file is referenced by the Gradle build (externalNativeBuild.cmake) and
# is responsible for:
#   1. Defining the project name and shared library target ("cocos").
#   2. Pulling in the shared common configuration (engine + game sources).
#   3. Creating the shared .so library that the APK loads at runtime.
# ============================================================================

cmake_minimum_required(VERSION 3.8)

# ---------------------------------------------------------------------------
# Project name — becomes the output .so filename (libcocos.so).
# Can be overridden via -DAPP_NAME=... from Gradle.
# ---------------------------------------------------------------------------
option(APP_NAME "Project Name" "et-mini-militia")
project(${APP_NAME} CXX)

# Internal bookkeeping variables used by the Cocos build system.
set(CC_LIB_NAME      cocos)            # Name of the shared library target
set(CC_PROJECT_DIR   ${CMAKE_CURRENT_LIST_DIR})
set(CC_PROJ_SOURCES)                   # Platform-specific sources (populated by engine)
set(CC_COMMON_SOURCES)                  # Cross-platform sources (Game.h/cpp)
set(CC_ALL_SOURCES)                     # Merged list — engine populates this

# ---------------------------------------------------------------------------
# Pull in the shared CMake config (engine options, feature toggles, sources).
# ---------------------------------------------------------------------------
include(${CMAKE_CURRENT_LIST_DIR}/../common/CMakeLists.txt)

# ---------------------------------------------------------------------------
# Build the shared library.
#   cc_android_before_target  — sets up Android-specific compile flags.
#   add_library               — compiles all sources into libcocos.so.
#   cc_android_after_target   — links system libraries (EGL, OpenSL, etc.).
# ---------------------------------------------------------------------------
cc_android_before_target(${CC_LIB_NAME})
add_library(${CC_LIB_NAME} SHARED ${CC_ALL_SOURCES})
cc_android_after_target(${CC_LIB_NAME})

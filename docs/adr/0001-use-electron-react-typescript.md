# Use Electron, React, and TypeScript for the Windows Desktop App

The MVP needs to orchestrate API calls, manage local media files, download generated avatar videos, invoke FFmpeg, and provide a modern desktop UI quickly. We will build the Windows desktop application with Electron, React, and TypeScript because it gives the fastest path to a reliable API-first video workflow with strong Node.js integration.

We considered Tauri and PySide. Tauri would create a smaller application but adds Rust-side desktop integration work during the MVP, while PySide would simplify some native packaging concerns but make a polished, modern UI slower to build. Electron's larger package size is acceptable for the MVP because workflow reliability and development speed matter more at this stage.

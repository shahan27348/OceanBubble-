<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🌊 Ocean Bubble Shooter - Experimental Hand Tracking Game

An immersive underwater-themed bubble shooter game controlled entirely by hand gestures! This is an **experimental game** that uses MediaPipe hand tracking technology.

## 🎮 Features

- **🖐️ Hand Gesture Controls Only**: Pure hand tracking experience (no mouse/touch)
- **🌊 Ocean Theme**: Beautiful underwater aesthetic with floating bubble animations
- **💻 Desktop + Webcam Required**: Experimental technology requires proper setup
- **🎯 Combo System**: Chain matches for multiplier bonuses up to 5x
- **⚡ Improved Physics**: Smooth arcs, better bouncing, and satisfying bubble popping
- **💥 Avalanche Effects**: Pop bubbles to trigger chain reactions
- **✨ Beautiful Effects**: Animated water bubbles floating in background

## 🚀 Run Locally

**Prerequisites:** 
- Node.js
- Desktop computer
- Webcam
- Modern browser (Chrome/Edge recommended)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the game:
   ```bash
   npm run dev
   ```

3. Open your browser and **allow camera access** when prompted

## 🎯 How to Play

### Hand Tracking Controls (Only Mode)
1. **Position Your Hand**: Hold your hand in front of the webcam
2. **Pinch**: Bring your index finger and thumb together near the bubble
3. **Pull Back**: While pinching, pull your hand back to aim
4. **Release**: Open your fingers to shoot the bubble
5. **Aim Guide**: Blue trajectory line shows where your shot will go

### Gameplay
- **Match 3+**: Match 3 or more bubbles of the same color to pop them
- **Build Combos**: Pop bubbles consecutively to build combo multipliers (up to 5x!)
- **Avalanche**: Popping bubbles may cause disconnected bubbles to fall
- **Game Over**: Don't let bubbles reach the bottom slingshot!

## 🌈 Bubble Types

- **🐠 Coral** (Pink) - 100 points
- **🌊 Ocean** (Blue) - 150 points  
- **💎 Aqua** (Cyan) - 200 points
- **✨ Pearl** (Yellow) - 250 points
- **🪼 Jellyfish** (Purple) - 300 points
- **⭐ Starfish** (Orange) - 500 points

## 🎨 Ocean Theme Features

- Deep ocean gradient background
- Animated floating bubbles (7 different sizes)
- Aqua-themed UI elements
- Ocean color palette for bubbles
- Water-inspired visual effects
- Pearl-colored slingshot bands

## 🛠️ Tech Stack

- React + TypeScript
- Vite
- **MediaPipe Hands** (Hand Tracking)
- Tailwind CSS
- Canvas API
- Web Audio API

## 💻 System Requirements

- **Platform**: Desktop only (laptop/PC)
- **Browser**: Chrome, Edge, or Firefox (latest version)
- **Webcam**: Required (built-in or external)
- **Lighting**: Good lighting for better hand detection
- **Internet**: Required to load MediaPipe models

## 🎮 Why Hand Tracking Only?

This is an **experimental game** designed to explore gesture-based gaming:
- Tests the capabilities of MediaPipe hand tracking
- Provides a unique, immersive gaming experience
- No traditional input methods needed
- Perfect for showcasing AI-powered interaction

## 🐛 Troubleshooting

- **Hand not detected?** Make sure you have good lighting
- **Laggy controls?** Close other browser tabs
- **Camera not working?** Check browser permissions
- **Pinch not working?** Bring fingers closer together

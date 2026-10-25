// Imperative camera surface for the presentation director (cinematic shooting camera, deployment visits).
// Filled in by CameraRig while it is mounted; null otherwise (tests install a stand-in).
//
// Everything is in world units (inches, y up). A view is an exact camera pose: where the lens sits and the point
// the orbit controls look at. Views handed to flyTo must respect the rig's limits (minimum distance, tilt, orbit
// target on the ground) or the rig will nudge the camera once it arrives; board/cameraPresets.ts and
// presentation/shotCamera.ts keep to them.

export interface CameraView {
  position: [number, number, number]
  target: [number, number, number]
}

export interface CameraApi {
  /** The exact pose the camera has right now. */
  getView(): CameraView
  /**
   * Eased tween to `view` over `ms`, reusing the preset tween. Resolves true when it arrived and false when something
   * else took the camera first (the player dragging, zooming, panning or picking a preset, or another flyTo), so the
   * director never fights the player.
   */
  flyTo(view: CameraView, ms: number): Promise<boolean>
  /** How many times the player (or a preset request) has taken the camera so far. A change means "hands off". */
  inputCount(): number
  /** The overview pose for the viewer's side of the board (what the 'edgeA' preset shows). */
  homeView(): CameraView
  /** Width over height of the canvas, for framing maths. */
  aspect(): number
}

export const cameraApi: { current: CameraApi | null } = { current: null }

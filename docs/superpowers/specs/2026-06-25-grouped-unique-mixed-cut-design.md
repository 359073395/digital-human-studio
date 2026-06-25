# Grouped Unique Mixed-Cut Engine Design

## Summary

The mixed-cut mode must treat the selected material directory as a structured shot library, not as a flat list of files. The root directory contains numeric folders such as `1`, `2`, `3`, and each numeric folder represents one ordered segment group in the final video. Each file inside a group is an independent 1-5 second shot candidate.

The engine must generate videos by selecting shots from each numeric group in folder order, applying each group's own reuse limit, and ensuring every exported video has a unique combination signature.

## Directory Model

Example:

```text
materials/
  1/
    a.mp4
    b.mp4
    c.mp4
  2/
    a.mp4
    b.mp4
  3/
    a.mp4
    b.mp4
    c.mp4
    d.mp4
```

Rules:

- Only numeric child folders are treated as shot groups.
- Groups are sorted by numeric value, so `1`, `2`, `10` sorts as `1`, `2`, `10`.
- Each supported video file inside a group is a shot candidate.
- A group may contain many shot candidates.
- The final video sequence must preserve group order. Shots from group `3` cannot appear before shots from group `2`.

## Shot Identity

Each shot candidate receives a stable internal identity:

```text
groupNumber + relativePath + fileSize + modifiedTime + contentHash
```

The content hash should be used when affordable. File size and modified time are kept as fast metadata for scanning and diagnostics. This prevents two files with the same name in different folders from being treated as the same shot.

## Per-Group Reuse Control

Each group has its own reuse percentage.

For a target of 20 generated videos:

```text
Group 1 reuse 20% => each shot in group 1 can appear at most 4 times.
Group 2 reuse 50% => each shot in group 2 can appear at most 10 times.
Group 3 reuse 30% => each shot in group 3 can appear at most 6 times.
```

Formula:

```text
maxUsesPerShot = max(1, floor(targetVideoCount * groupReusePercent / 100))
```

If the requested output cannot be generated under the configured limits, the app must stop before rendering and show a clear material shortage message. It should not silently exceed the reuse limit.

## Combination Signature

Every generated video stores a unique combination signature.

Example:

```text
1:a.mp4#hashA + 1:c.mp4#hashC + 2:b.mp4#hashB + 3:a.mp4#hashD
```

The signature must include group number, ordered shot position, and shot identity. A signature can only be used once per task. If a candidate signature already exists, the engine must choose another candidate or report that no unique combinations remain.

## Selection Behavior

The first implementation should use deterministic planning by default:

- Read all numeric groups.
- Build a usage counter per shot.
- For each output video, select one or more shots from each group while respecting group order.
- Prefer shots with lower usage count.
- Break ties by rotating through the group to avoid always selecting the same early files.
- Reject a candidate if any shot would exceed its group reuse limit.
- Reject a candidate if its combination signature already exists.

The UI can still describe this as automatic generation count, but internally the count must be limited by both:

- number of possible unique combinations;
- per-group reuse capacity.

## UI Requirements

The mixed-cut screen should show a scan table:

```text
Group | Shot count | Reuse % | Max uses per shot | Estimated capacity | Status
1     | 3          | 20      | 4                 | 12                 | OK
2     | 2          | 50      | 10                | 20                 | OK
3     | 4          | 30      | 6                 | 24                 | OK
```

The app should display:

- detected group count;
- shot count per group;
- per-group reuse controls;
- estimated maximum unique videos;
- suggested output count;
- material shortage warnings;
- a preview of the planned combination signatures before rendering.

## Output Records

Each generated video must write an `edit-decisions.json` record containing:

- batch index;
- output preset;
- combination signature;
- selected group order;
- selected shot IDs;
- source relative paths;
- source duration;
- rendered duration;
- per-shot use count after selection;
- warnings.

These records are required for debugging, regeneration, and later dedup processing.

## Error Handling

The app must stop with a clear error when:

- the selected directory has no numeric groups;
- any numeric group has no supported video files;
- the target count cannot be reached under group reuse limits;
- no unique combinations remain;
- a source file is missing after scan;
- FFmpeg cannot render a selected shot.

The error should suggest one of:

- add more shots to a specific group;
- increase that group's reuse percentage;
- lower the output count;
- remove or replace unsupported files.

## Test Plan

- Scan a root folder with `1`, `2`, `10` and verify numeric order.
- Verify each group reports the correct video count.
- Verify non-numeric folders are ignored.
- Generate multiple outputs and assert every combination signature is unique.
- Configure low reuse for one group and assert the engine stops when that group is exhausted.
- Verify usage counts never exceed each group's reuse limit.
- Verify `edit-decisions.json` includes group number, shot ID, path, signature, and use counts.
- Verify portrait and landscape exports use the same combination plan for the same batch index.
- Verify `release:e2e:real` still passes for mixed-cut and video-dedup.

## Assumptions

- The grouped mixed-cut engine is still separate from video dedup mode.
- Reuse percentage controls shot usage inside each group, not platform originality.
- The app reports internal originality and reuse risk; it does not promise any platform will classify the output as original.
- The first implementation can use deterministic planning. Randomized seed-based planning can be added later if needed.

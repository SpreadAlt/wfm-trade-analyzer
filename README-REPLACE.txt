FrameAnalytics — AdSense index replacement

Copy the contents of this folder into the ROOT of the GitHub repository
and replace files with the same names.

Files:
- index.html
- src/App.tsx
- public/ads.txt

AdSense client:
ca-pub-2843566361106419

The AdSense script is loaded ONLY from index.html.
The React AdSenseLoader import/usages were removed from App.tsx.

If src/AdSense.tsx exists from the previous overlay, it is now unused and may
be deleted later, but leaving the unused file in the repository does not load
AdSense twice.

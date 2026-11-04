#!/usr/bin/env bash
# Reference commands, NOT executed by this pack.
# Fill these values and sign in with the official Google Cloud CLI first.
set -euo pipefail
VIDEO_PROJECT='REPLACE_WITH_PROJECT_ID'
VIDEO_BUCKET='REPLACE_WITH_GLOBALLY_UNIQUE_PUBLIC_VIDEO_BUCKET'
VIDEO_REGION='REPLACE_WITH_REGION'
if [[ "$VIDEO_PROJECT" == REPLACE* || "$VIDEO_BUCKET" == REPLACE* || "$VIDEO_REGION" == REPLACE* ]]; then
  echo 'Fill in project, bucket and region before running.' >&2
  exit 1
fi
# Use an existing billing-enabled project and the intended signed-in identity.
gcloud storage buckets create "gs://${VIDEO_BUCKET}" --project="$VIDEO_PROJECT" --location="$VIDEO_REGION" --uniform-bucket-level-access
# ONLY a dedicated bucket containing reviewed public videos:
gcloud storage buckets update "gs://${VIDEO_BUCKET}" --no-public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://${VIDEO_BUCKET}" --member=allUsers --role=roles/storage.objectViewer
# Put only approved MP4s in ./approved; uploads have versioned filenames.
shopt -s nullglob
video_files=(approved/*.mp4)
if ((${#video_files[@]} == 0)); then
  echo 'Bucket configured; no approved MP4s found. No files uploaded.'
  exit 0
fi
for video_file in "${video_files[@]}"; do
  gcloud storage cp "$video_file" "gs://${VIDEO_BUCKET}/exercises/aio-coach-v1/" --content-type=video/mp4 --cache-control='public,max-age=31536000,immutable'
  video_name="${video_file##*/}"
  video_url="https://storage.googleapis.com/${VIDEO_BUCKET}/exercises/aio-coach-v1/${video_name}"
  curl --fail --silent --show-error --head "$video_url"
  printf '%s\n' "$video_url"
done

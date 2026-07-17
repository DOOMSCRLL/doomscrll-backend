export default {
	responses: {
		common: {
			UNAUTHORIZED: "Signed user does not own this DOOMLIT, or session is invalid.",
			INVALID_STATE:
				"The project is in a state where it can no longer receive modifications, or is not awaiting content (e.g, it is already showcased, or canceled).",
		},
		getUploadUrls: {
			SUCCESS: "Upload URLs have been generated successfully.",
			INTERNAL_ERROR:
				"An unexpected error occurred on the server while generating the presigned URLs for image uploads.",
		},
		updateProject: {
			SUCCESS: "Project details are updated.",
			INTERNAL_ERROR: "An unexpected error occurred on the server while updating the project details.",
		},
		publishProject: {
			SUCCESS: "Project is ready for the showcase!",
			VALIDATION_FAILED:
				"Project is not ready for the showcase (e.g, missing cover image, or tags). You can edit and update details of your project until it's showcase date.",
			INTERNAL_ERROR: 'An unexpected error occurred on the server while changing the project status to "ready".',
		},
	},
}

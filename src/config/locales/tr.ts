import { Dictionary } from "./index.js"

export default {
	responses: {
		common: {
			UNAUTHORIZED: "Bu DOOMLIT oturum açmış kullanıcıya ait değil, ya da oturum geçersiz.",
			INVALID_STATE:
				"Proje değiştirilemeyecek bir durumda, ya da değişiklik kabul etmiyor. (örn. zaten gösterimde, ya da iptal edilmiş).",
		},
		getUploadUrls: {
			SUCCESS: "Fotoğraf dosyaları için yükleme bağlantıları başarıyla üretildi.",
			INTERNAL_ERROR: "Fotoğraf yüklemesi için bağlantı üretirken sunucuda beklenmedik bir hata oluştu.",
		},
		updateProject: {
			SUCCESS: "Proje ayrıntıları başarıyla güncellendi.",
			INTERNAL_ERROR: "Proje ayrıntıları güncellenirken sunucuda beklenmedik bir hata oluştu.",
		},
		publishProject: {
			SUCCESS: "Bu proje gösterime hazır!",
			VALIDATION_FAILED:
				"Proje gösterime hazır değil (örn. kapak fotoğrafı eksik, ya da etiketleri). Projen, gösterim tarihine kadar düzenlenip, güncellenebilir.",
			INTERNAL_ERROR: 'Projenin durumu "hazır"a güncellenirken sunucuda beklenmedik bir hata oluştu.',
		},
	},
} satisfies Dictionary

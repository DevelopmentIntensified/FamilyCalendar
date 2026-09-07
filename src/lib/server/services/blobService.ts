import { put, del, list } from '@vercel/blob';

const BUCKET_PREFIX = 'family-master/ads';
const RECEIPT_PREFIX = 'family-master/receipts';

export interface UploadBlobOptions {
	filename: string;
	content: Buffer;
	contentType?: string;
}

export interface BlobAsset {
	url: string;
	filename: string;
	contentType: string;
	size: number;
	uploadedAt: Date;
}

export async function uploadAdAsset(file: UploadBlobOptions): Promise<BlobAsset> {
	const path = `${BUCKET_PREFIX}/${file.filename}`;

	const blob = await put(path, file.content, {
		contentType: file.contentType ?? 'image/png',
		access: 'public'
	});

	return {
		url: blob.url,
		filename: blob.pathname,
		contentType: 'image/png',
		size: 0,
		uploadedAt: new Date()
	};
}

export async function getBlobUrl(filename: string): Promise<string> {
	const path = `${BUCKET_PREFIX}/${filename}`;

	const result = await list({
		prefix: path
	});

	if (result.blobs.length === 0) {
		throw new Error(`Blob not found: ${filename}`);
	}

	return result.blobs[0].url;
}

export async function deleteBlobAsset(url: string): Promise<void> {
	await del(url);
}

export async function listBlobAssets(prefix?: string): Promise<BlobAsset[]> {
	const searchPrefix = prefix ? `${BUCKET_PREFIX}/${prefix}` : BUCKET_PREFIX;

	const result = await list({
		prefix: searchPrefix
	});

	return result.blobs.map((blob) => ({
		url: blob.url,
		filename: blob.pathname,
		contentType: 'image/png',
		size: 0,
		uploadedAt: new Date()
	}));
}

export async function deleteAdAssetByFilename(filename: string): Promise<void> {
	const url = await getBlobUrl(filename);
	await deleteBlobAsset(url);
}

export interface StoredBlob {
	url: string;
	pathname: string;
}

/**
 * Stores a bill-receipt image under family-master/receipts. Returns the
 * public blob URL (receipts are as public as ad assets; noted in issue 010).
 */
export async function uploadReceiptAsset(file: UploadBlobOptions): Promise<StoredBlob> {
	const blob = await put(`${RECEIPT_PREFIX}/${file.filename}`, file.content, {
		contentType: file.contentType ?? 'image/jpeg',
		access: 'public'
	});
	return { url: blob.url, pathname: blob.pathname };
}

/** Deletes a stored receipt by its full blob URL. */
export async function deleteReceiptAsset(url: string): Promise<void> {
	await del(url);
}

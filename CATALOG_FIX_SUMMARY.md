# Catalog Creation Fix Summary

## Muammo (Problem)

Katalog elementlarini yaratishda `400 Bad Request` xatosi kelib chiqdi. Sabab:

1. Program tipidagi katalog elementlari uchun `metadata` ni validatsiya qilinmadi
2. Backend `metadata` ni quyidagi maydonlarni talab qildi:
   - `level` (bachelor/master)
   - `track` (italian/uzbek/n/a)
   - `language` (string)
   - `duration_years` (positive integer)

## Yechim (Solution)

### 1. API Type Information Added (`lib/api.ts`)

```typescript
export interface CatalogTypeInfo {
  value: CatalogType;
  label: string;
  description: string;
  requiresMetadata: boolean;
  metadataFields?: Record<string, { required: boolean; type: string }>;
}

export const CATALOG_TYPES_INFO: CatalogTypeInfo[] = [...]
```

**Foyda:** Types to'l ma'lumotlari API dan kelib chiqadi, hardcode bo'lmaydi.

### 2. Form Data Structure Enhanced

```typescript
interface CatalogFormData {
  type: CatalogType;
  // ... existing fields
  // Program-specific metadata fields
  programLevel: string;
  programTrack: string;
  programLanguage: string;
  programDurationYears: string;
  // Generic JSON metadata for other types
  meta: string;
}
```

### 3. Conditional Form Fields

- **Program tipidagi elementlar**: Dedicated form fields ko'rsatiladi
  - Darajasi (Level) selecti
  - Tarmoq (Track) selecti
  - O'quv tili (Language) inputi
  - O'quv muddati (Duration) number inputi
- **Boshqa tipidagi elementlar**: JSON metadata textarea ko'rsatiladi

### 4. Proper Validation

```typescript
// Program tipida metadata validatsiyasi
if (formData.type === "program") {
  // Barcha maydonlar to'ldirilganini tekshir
  // Duration_years butun son ekanini tekshir
  metadata = {
    level: formData.programLevel,
    track: formData.programTrack,
    language: formData.programLanguage,
    duration_years: parseInt(formData.programDurationYears),
  };
}
```

### 5. API Request Body Fix

```typescript
// Now correctly sends:
{
  "type": "program",
  "name": "O'zbekcha nomi",
  "name_uz": "O'zbekcha nomi",
  "name_ru": "Ruscha nomi",
  "name_en": "English name",
  "description": "...",
  "metadata": {
    "level": "bachelor",
    "track": "italian",
    "language": "English",
    "duration_years": 4
  }
}
```

## UI Improvements

1. **Type Selector**: Har bir dialog (create/edit) da type selector qo'shildi
2. **Conditional Fields**: Tipi bo'yicha mos formalar ko'rsatiladi
3. **Better Layout**: Dastur ma'lumotlari separate block ichida ko'rsatiladi
4. **Input Hints**: Har bir field uchun placeholder va maxsus ko'rsatmalar qo'shildi
5. **Scroll Support**: Dialog uzun bo'lgan taqdirda scroll qo'shildi

## Testing Checklist

- [x] Dashboard build completed without errors
- [ ] Create new program with all required fields
- [ ] Create other catalog types (direction, track, subject, region)
- [ ] Edit existing catalog item
- [ ] Verify metadata is saved correctly in database
- [ ] Verify API response contains metadata

## Files Changed

1. `/dashboard/lib/api.ts` - API types and constants
2. `/dashboard/app/dashboard/catalog/page.tsx` - Catalog management page

## Backward Compatibility

✅ Existing katalog elementlari o'zgartirilmaydi.
✅ Mavjud API endpoints ishini davom ettiradi.

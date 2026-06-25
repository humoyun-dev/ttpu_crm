"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  Edit,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  catalogApi,
  CatalogItem,
  CatalogType,
  CATALOG_TYPES_INFO,
  formatDate,
} from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CatalogFormData {
  type: CatalogType;
  name: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
  // Generic metadata
  meta: string;
}

export default function CatalogPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<CatalogType>("direction");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [formData, setFormData] = useState<CatalogFormData>({
    type: "direction",
    name: "",
    name_uz: "",
    name_ru: "",
    name_en: "",
    meta: "{}",
  });
  const [submitting, setSubmitting] = useState(false);

  const currentTypeInfo =
    CATALOG_TYPES_INFO.find((t) => t.value === formData.type) ||
    CATALOG_TYPES_INFO[0];

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await catalogApi.list(activeTab);
      if (res.error) throw new Error(res.error.message as string);
      setItems(res.data?.results || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ma'lumotlarni yuklab bo'lmadi",
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredItems = items.filter((item) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      item.name?.toLowerCase().includes(searchLower) ||
      item.name_uz?.toLowerCase().includes(searchLower) ||
      item.name_ru?.toLowerCase().includes(searchLower) ||
      item.name_en?.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower)
    );
  });

  const resetForm = (type: CatalogType = "direction") => {
    setFormData({
      type,
      name: "",
      name_uz: "",
      name_ru: "",
      name_en: "",
      meta: "{}",
    });
    setSelectedItem(null);
  };

  const handleCreate = async () => {
    if (!formData.name_uz.trim()) {
      toast.error("O'zbekcha nom kiritilishi shart");
      return;
    }

    setSubmitting(true);
    try {
      let metadata: Record<string, unknown> = {};

      // Build metadata from JSON meta field
      if (formData.meta.trim() && formData.meta.trim() !== "{}") {
        try {
          metadata = JSON.parse(formData.meta);
        } catch {
          toast.error("Meta JSON noto'g'ri formatida");
          setSubmitting(false);
          return;
        }
      }

      const payload: Parameters<typeof catalogApi.create>[1] = {
        name: formData.name_uz,
        name_uz: formData.name_uz,
        name_ru: formData.name_ru,
        name_en: formData.name_en,
      };
      // Only send metadata if non-empty
      if (Object.keys(metadata).length > 0) {
        payload.meta = metadata;
      }

      const res = await catalogApi.create(formData.type, payload);

      if (res.error) {
        throw new Error(String(res.error.message || "Xatolik yuz berdi"));
      }

      toast.success("✓ Muvaffaqiyatli yaratildi");
      setCreateDialogOpen(false);
      resetForm(activeTab);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xatolik yuz berdi");
      console.error("Catalog create error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedItem || !formData.name_uz.trim()) {
      toast.error("O'zbekcha nom kiritilishi shart");
      return;
    }

    setSubmitting(true);
    try {
      let metadata: Record<string, unknown> = {};

      // Build metadata from JSON meta field
      if (formData.meta.trim() && formData.meta.trim() !== "{}") {
        try {
          metadata = JSON.parse(formData.meta);
        } catch {
          toast.error("Meta JSON noto'g'ri formatida");
          setSubmitting(false);
          return;
        }
      }

      const updatePayload: Parameters<typeof catalogApi.update>[2] = {
        name: formData.name_uz,
        name_uz: formData.name_uz,
        name_ru: formData.name_ru,
        name_en: formData.name_en,
      };
      // Only send metadata if non-empty
      if (Object.keys(metadata).length > 0) {
        updatePayload.meta = metadata;
      }

      const res = await catalogApi.update(
        formData.type,
        selectedItem.id,
        updatePayload,
      );

      if (res.error) {
        throw new Error(String(res.error.message || "Xatolik yuz berdi"));
      }

      toast.success("✓ Muvaffaqiyatli yangilandi");
      setEditDialogOpen(false);
      resetForm(activeTab);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xatolik yuz berdi");
      console.error("Catalog update error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;

    setSubmitting(true);
    try {
      const res = await catalogApi.delete(activeTab, selectedItem.id);
      if (res.error) throw new Error(res.error.message as string);

      toast.success("Muvaffaqiyatli o'chirildi");
      setDeleteDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (item: CatalogItem) => {
    setSelectedItem(item);

    setFormData({
      type: item.type,
      name: item.name || "",
      name_uz: item.name_uz || item.name || "",
      name_ru: item.name_ru || "",
      name_en: item.name_en || "",
      meta: JSON.stringify(item.metadata || {}, null, 2),
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (item: CatalogItem) => {
    setSelectedItem(item);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Boshqaruv / Katalog"
        title="Katalog"
        description="Ma'lumotlar bazasi katalogi — yo'nalishlar, dasturlar va boshqa elementlar."
        actions={
          <>
            <Button onClick={fetchData} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Yangilash
            </Button>
            {isAdmin && (
              <Button onClick={() => setCreateDialogOpen(true)} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Yangi qo'shish
              </Button>
            )}
          </>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as CatalogType);
          resetForm(v as CatalogType);
        }}
      >
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted p-1">
          {CATALOG_TYPES_INFO.map((type) => (
            <TabsTrigger key={type.value} value={type.value} className="rounded-md px-3 py-1.5 text-sm">
              {type.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <CardTitle className="text-base">{currentTypeInfo.label}</CardTitle>
                  <CardDescription className="text-xs">
                    {currentTypeInfo.description} ·{" "}
                    <span className="font-mono tabular-nums">{items.length}</span> ta
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Qidirish..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6"><TableLoading /></div>
              ) : error ? (
                <div className="p-6"><ErrorDisplay message={error} onRetry={fetchData} /></div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                  <Search className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Ma&apos;lumot topilmadi</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">#</TableHead>
                      <TableHead>Nomlar</TableHead>
                      <TableHead>Sana</TableHead>
                      {isAdmin && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item, idx) => (
                      <TableRow
                        key={item.id}
                        className="group relative align-top transition-colors hover:bg-muted/40"
                      >
                        <TableCell className="relative pl-4 font-mono text-xs tabular-nums text-muted-foreground">
                          <span className="absolute left-0 top-0 h-full w-0.5 bg-accent-gold opacity-0 transition-opacity group-hover:opacity-100" />
                          {idx + 1}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm leading-snug">
                            {item.name_uz || item.name || "—"}
                          </p>
                          {item.name_ru && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              🇷🇺 {item.name_ru}
                            </p>
                          )}
                          {item.name_en && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              🇬🇧 {item.name_en}
                            </p>
                          )}
                          {item.metadata && Object.keys(item.metadata).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(item.metadata).slice(0, 3).map(([k, v]) => (
                                <Badge key={k} variant="outline" className="px-1.5 py-0 font-mono text-[10px] font-normal">
                                  {k}: {String(v)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                          {formatDate(item.created_at)}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(item)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Tahrirlash
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(item)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  O&apos;chirish
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Yangi{" "}
              {CATALOG_TYPES_INFO.find(
                (t) => t.value === formData.type,
              )?.label.toLowerCase()}{" "}
              qo'shish
            </DialogTitle>
            <DialogDescription>
              Yangi element ma'lumotlarini to'ldiring
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Type Selector */}
            <div className="space-y-2">
              <Label htmlFor="type">Turi *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => {
                  const newType = value as CatalogType;
                  setFormData({ ...formData, type: newType });
                }}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Turdagi element tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG_TYPES_INFO.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label} - {type.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Uzbek Name - Required */}
            <div className="space-y-2">
              <Label htmlFor="name_uz">🇺🇿 O&apos;zbekcha nomi *</Label>
              <Input
                id="name_uz"
                value={formData.name_uz}
                onChange={(e) =>
                  setFormData({ ...formData, name_uz: e.target.value })
                }
                placeholder="O'zbekcha nomini kiriting"
              />
            </div>

            {/* Russian Name */}
            <div className="space-y-2">
              <Label htmlFor="name_ru">🇷🇺 Ruscha nomi</Label>
              <Input
                id="name_ru"
                value={formData.name_ru}
                onChange={(e) =>
                  setFormData({ ...formData, name_ru: e.target.value })
                }
                placeholder="Русское название"
              />
            </div>

            {/* English Name */}
            <div className="space-y-2">
              <Label htmlFor="name_en">🇬🇧 Inglizcha nomi</Label>
              <Input
                id="name_en"
                value={formData.name_en}
                onChange={(e) =>
                  setFormData({ ...formData, name_en: e.target.value })
                }
                placeholder="English name"
              />
            </div>

            {/* Generic JSON metadata */}
            {(
              <div className="space-y-2">
                <Label htmlFor="meta">Meta (JSON) - Ixtiyoriy</Label>
                <Textarea
                  id="meta"
                  value={formData.meta}
                  onChange={(e) =>
                    setFormData({ ...formData, meta: e.target.value })
                  }
                  placeholder='{"key": "value"}'
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                resetForm(activeTab);
              }}
            >
              Bekor qilish
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tahrirlash</DialogTitle>
            <DialogDescription>
              Element ma&apos;lumotlarini o&apos;zgartiring
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Uzbek Name - Required */}
            <div className="space-y-2">
              <Label htmlFor="edit-name_uz">🇺🇿 O&apos;zbekcha nomi *</Label>
              <Input
                id="edit-name_uz"
                value={formData.name_uz}
                onChange={(e) =>
                  setFormData({ ...formData, name_uz: e.target.value })
                }
                placeholder="O'zbekcha nomini kiriting"
              />
            </div>

            {/* Russian Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name_ru">🇷🇺 Ruscha nomi</Label>
              <Input
                id="edit-name_ru"
                value={formData.name_ru}
                onChange={(e) =>
                  setFormData({ ...formData, name_ru: e.target.value })
                }
                placeholder="Русское название"
              />
            </div>

            {/* English Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name_en">🇬🇧 Inglizcha nomi</Label>
              <Input
                id="edit-name_en"
                value={formData.name_en}
                onChange={(e) =>
                  setFormData({ ...formData, name_en: e.target.value })
                }
                placeholder="English name"
              />
            </div>

            {/* Generic JSON metadata */}
            {(
              <div className="space-y-2">
                <Label htmlFor="edit-meta">Meta (JSON)</Label>
                <Textarea
                  id="edit-meta"
                  value={formData.meta}
                  onChange={(e) =>
                    setFormData({ ...formData, meta: e.target.value })
                  }
                  placeholder='{"key": "value"}'
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Bekor qilish
            </Button>
            <Button onClick={handleEdit} disabled={submitting}>
              {submitting ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>O'chirishni tasdiqlang</AlertDialogTitle>
            <AlertDialogDescription>
              Siz haqiqatan ham "{selectedItem?.name}" ni o'chirmoqchimisiz? Bu
              amalni qaytarib bo'lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? "O'chirilmoqda..." : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

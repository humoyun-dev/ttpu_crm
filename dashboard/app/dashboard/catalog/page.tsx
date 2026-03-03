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
  CatalogTypeInfo,
  formatDate,
} from "@/lib/api";
import { toast } from "sonner";
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
  const [activeTab, setActiveTab] = useState<CatalogType>("program");
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
    type: "program",
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

  const resetForm = (type: CatalogType = "program") => {
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

      const res = await catalogApi.create(formData.type, {
        type: formData.type,
        name: formData.name_uz,
        name_uz: formData.name_uz,
        name_ru: formData.name_ru,
        name_en: formData.name_en,
        meta: metadata,
      } as any);

      if (res.error) throw new Error(res.error.message as string);

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

      const res = await catalogApi.update(formData.type, selectedItem.id, {
        name: formData.name_uz,
        name_uz: formData.name_uz,
        name_ru: formData.name_ru,
        name_en: formData.name_en,
        meta: metadata,
      });

      if (res.error) throw new Error(res.error.message as string);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Katalog</h1>
          <p className="text-muted-foreground">Ma'lumotlar bazasi katalogi</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Yangilash
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Yangi qo'shish
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as CatalogType);
          resetForm(v as CatalogType);
        }}
      >
        <TabsList className="grid w-full grid-cols-6">
          {CATALOG_TYPES_INFO.map((type) => (
            <TabsTrigger key={type.value} value={type.value}>
              {type.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{currentTypeInfo.label}</CardTitle>
                  <CardDescription>
                    {currentTypeInfo.description} • Jami: {items.length} ta
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Qidirish..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <TableLoading />
              ) : error ? (
                <ErrorDisplay message={error} onRetry={fetchData} />
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>🇺🇿 O&apos;zbekcha</TableHead>
                        <TableHead>🇷🇺 Ruscha</TableHead>
                        <TableHead>🇬🇧 Inglizcha</TableHead>
                        <TableHead>Meta</TableHead>
                        <TableHead>Yaratilgan</TableHead>
                        <TableHead className="w-[80px]">Amal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center text-muted-foreground"
                          >
                            Ma'lumot topilmadi
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.name_uz || item.name || "-"}
                            </TableCell>
                            <TableCell>{item.name_ru || "-"}</TableCell>
                            <TableCell>{item.name_en || "-"}</TableCell>
                            <TableCell>
                              {item.metadata &&
                              Object.keys(item.metadata).length > 0 ? (
                                <Badge variant="outline">
                                  {Object.keys(item.metadata).length} ta maydon
                                </Badge>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell>{formatDate(item.created_at)}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => openEditDialog(item)}
                                  >
                                    <Edit className="mr-2 h-4 w-4" />
                                    Tahrirlash
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openDeleteDialog(item)}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    O'chirish
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
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
            {formData.type !== "program" && (
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
            {formData.type !== "program" && (
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
              className="bg-red-600 hover:bg-red-700"
            >
              {submitting ? "O'chirilmoqda..." : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

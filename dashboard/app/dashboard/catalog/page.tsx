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
  formatDate,
  getItemName,
} from "@/lib/api";
import { toast } from "sonner";

const CATALOG_TYPES: {
  value: CatalogType;
  label: string;
  description: string;
}[] = [
  { value: "program", label: "Dasturlar", description: "Ta'lim dasturlari" },
  {
    value: "direction",
    label: "Yo'nalishlar",
    description: "Ta'lim yo'nalishlari",
  },
  {
    value: "region",
    label: "Hududlar",
    description: "Viloyatlar va shaharlar",
  },
  { value: "track", label: "Tarmoqlar", description: "Yo'nalish tarmoqlari" },
  { value: "subject", label: "Fanlar", description: "O'quv fanlari" },
];

interface CatalogFormData {
  name: string;
  description: string;
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
    name: "",
    description: "",
    meta: "{}",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await catalogApi.list(activeTab);
      if (res.error) throw new Error(res.error.message as string);
      setItems(res.data?.results || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ma'lumotlarni yuklab bo'lmadi"
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
      item.description?.toLowerCase().includes(searchLower)
    );
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", meta: "{}" });
    setSelectedItem(null);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("Nom kiritilishi shart");
      return;
    }

    setSubmitting(true);
    try {
      let meta = {};
      try {
        meta = JSON.parse(formData.meta || "{}");
      } catch {
        toast.error("Meta noto'g'ri JSON formatida");
        setSubmitting(false);
        return;
      }

      const res = await catalogApi.create(activeTab, {
        name: formData.name,
        description: formData.description,
        meta,
      });

      if (res.error) throw new Error(res.error.message as string);

      toast.success("Muvaffaqiyatli yaratildi");
      setCreateDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedItem || !formData.name.trim()) {
      toast.error("Nom kiritilishi shart");
      return;
    }

    setSubmitting(true);
    try {
      let meta = {};
      try {
        meta = JSON.parse(formData.meta || "{}");
      } catch {
        toast.error("Meta noto'g'ri JSON formatida");
        setSubmitting(false);
        return;
      }

      const res = await catalogApi.update(activeTab, selectedItem.id, {
        name: formData.name,
        description: formData.description,
        meta,
      });

      if (res.error) throw new Error(res.error.message as string);

      toast.success("Muvaffaqiyatli yangilandi");
      setEditDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xatolik yuz berdi");
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
      name: item.name || "",
      description: item.description || "",
      meta: JSON.stringify(item.meta || {}, null, 2),
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (item: CatalogItem) => {
    setSelectedItem(item);
    setDeleteDialogOpen(true);
  };

  const currentTypeInfo = CATALOG_TYPES.find((t) => t.value === activeTab);

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
        onValueChange={(v) => setActiveTab(v as CatalogType)}
      >
        <TabsList className="grid w-full grid-cols-5">
          {CATALOG_TYPES.map((type) => (
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
                  <CardTitle>{currentTypeInfo?.label}</CardTitle>
                  <CardDescription>
                    {currentTypeInfo?.description} • Jami: {items.length} ta
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
                        <TableHead>Nomi</TableHead>
                        <TableHead>Tavsif</TableHead>
                        <TableHead>Meta</TableHead>
                        <TableHead>Yaratilgan</TableHead>
                        <TableHead className="w-[80px]">Amal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center text-muted-foreground"
                          >
                            Ma'lumot topilmadi
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {getItemName(item)}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {item.description || "-"}
                            </TableCell>
                            <TableCell>
                              {item.meta &&
                              Object.keys(item.meta).length > 0 ? (
                                <Badge variant="outline">
                                  {Object.keys(item.meta).length} ta maydon
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Yangi {currentTypeInfo?.label.toLowerCase()} qo'shish
            </DialogTitle>
            <DialogDescription>
              Yangi element ma'lumotlarini kiriting
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nomi *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Nomini kiriting"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Tavsif</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Tavsifni kiriting"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta">Meta (JSON)</Label>
              <Textarea
                id="meta"
                value={formData.meta}
                onChange={(e) =>
                  setFormData({ ...formData, meta: e.target.value })
                }
                placeholder='{"key": "value"}'
                rows={4}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tahrirlash</DialogTitle>
            <DialogDescription>
              Element ma'lumotlarini o'zgartiring
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nomi *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Nomini kiriting"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Tavsif</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Tavsifni kiriting"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-meta">Meta (JSON)</Label>
              <Textarea
                id="edit-meta"
                value={formData.meta}
                onChange={(e) =>
                  setFormData({ ...formData, meta: e.target.value })
                }
                placeholder='{"key": "value"}'
                rows={4}
                className="font-mono text-sm"
              />
            </div>
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

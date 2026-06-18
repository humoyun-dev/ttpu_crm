"use client";

import { useEffect, useState } from "react";
import { documentApi, Document, DocumentStatus, DocumentType, DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Search, FileText, RefreshCw, CheckCircle, Flag } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_BADGE: Record<DocumentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  verified: "default",
  flagged: "destructive",
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | DocumentType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DocumentStatus>("all");

  const load = async () => {
    setLoading(true);
    try {
      const res = await documentApi.list();
      setDocuments(res.data?.results ?? []);
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleReview = async (id: string, status: DocumentStatus) => {
    try {
      const res = await documentApi.review(id, status);
      if (res.error) throw new Error();
      toast.success(status === "verified" ? "Hujjat tasdiqlandi" : "Hujjat belgilandi");
      load();
    } catch {
      toast.error("Xatolik yuz berdi");
    }
  };

  const filtered = documents.filter(d => {
    const matchSearch = d.student_external_id.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || d.type === typeFilter;
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hujjatlar</h1>
          <p className="text-sm text-muted-foreground">{documents.length} ta hujjat</p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 items-center gap-2 min-w-48">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Student ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => setTypeFilter(v as "all" | DocumentType)}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="Tur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                {(Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as "all" | DocumentStatus)}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue placeholder="Holat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                {(Object.entries(DOCUMENT_STATUS_LABELS) as [DocumentStatus, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Tur</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead>Yuklangan</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Yuklanmoqda...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    {search || typeFilter !== "all" || statusFilter !== "all" ? "Natija topilmadi" : "Hali hujjat yo'q"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.student_external_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{DOCUMENT_TYPE_LABELS[d.type]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[d.status]}>
                        {DOCUMENT_STATUS_LABELS[d.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(d.created_at).toLocaleDateString("uz-UZ")}
                    </TableCell>
                    <TableCell>
                      {d.status === "pending" && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600 hover:text-green-700"
                            onClick={() => handleReview(d.id, "verified")}
                            title="Tasdiqlash"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-500 hover:text-amber-600"
                            onClick={() => handleReview(d.id, "flagged")}
                            title="Belgilash"
                          >
                            <Flag className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

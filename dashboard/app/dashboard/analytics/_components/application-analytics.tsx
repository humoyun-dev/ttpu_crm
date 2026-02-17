"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ApiResponse,
  PaginatedResponse,
  getApplicantName,
  getStatusLabel,
  formatDate,
  Bot1Applicant,
} from "@/lib/api";

type StatusKey = "new" | "submitted" | "in_progress" | "approved" | "rejected";

const statusOrder: StatusKey[] = [
  "new",
  "submitted",
  "in_progress",
  "approved",
  "rejected",
];

interface ApplicationItem {
  id: string;
  status: StatusKey;
  updated_at: string;
  applicant_details?: Bot1Applicant;
  applicant?: string;
}

type Fetcher<T> = (
  params: Record<string, string>,
) => Promise<ApiResponse<PaginatedResponse<T>>>;

type ExtraFilter = {
  key: string;
  label: string;
  options: { label: string; value: string }[];
};

interface Props<T extends ApplicationItem> {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  fetcher: Fetcher<T>;
  manageHref: string;
  extraFilters?: ExtraFilter[];
}

export function ApplicationAnalytics<T extends ApplicationItem>({
  title,
  description,
  icon: Icon,
  fetcher,
  manageHref,
  extraFilters,
}: Props<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [status, setStatus] = useState<string>("all");
  const [extra, setExtra] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {
          page_size: "300",
          ordering: "-updated_at",
        };
        if (from) params.from = new Date(from).toISOString();
        if (to) params.to = new Date(to).toISOString();
        if (status !== "all") params.status = status;
        Object.entries(extra).forEach(([k, v]) => {
          if (v && v !== "all") params[k] = v;
        });

        const res = await fetcher(params);
        if (res.data?.results) {
          setItems(res.data.results);
        } else {
          setItems([]);
        }
      } catch (err) {
        console.error(err);
        setError("Ma'lumotni yuklab bo'lmadi");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [fetcher, from, to, status, extra]);

  const counts = useMemo(() => {
    const base: Record<StatusKey, number> = {
      new: 0,
      submitted: 0,
      in_progress: 0,
      approved: 0,
      rejected: 0,
    };
    items.forEach((item) => {
      const key = item.status || "new";
      if (key in base) base[key as StatusKey] += 1;
    });
    return base;
  }, [items]);

  const latest = useMemo(
    () =>
      [...items]
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
        .slice(0, 6),
    [items],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Icon className="h-8 w-8 text-primary" />
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-dashed border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Jami arizalar</CardTitle>
            <CardDescription>Umumiy son</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{items.length}</div>
          </CardContent>
        </Card>
        {statusOrder.map((key) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{getStatusLabel(key)}</span>
                <Badge variant="outline">{counts[key]}</Badge>
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtrlar</CardTitle>
          <CardDescription>Vaqt va holat bo'yicha saralang</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Boshlanish</p>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Tugash</p>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Status</p>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                {statusOrder.map((s) => (
                  <SelectItem key={s} value={s}>
                    {getStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {extraFilters?.map((f) => (
            <div className="space-y-1" key={f.key}>
              <p className="text-sm text-muted-foreground">{f.label}</p>
              <Select
                value={extra[f.key] || "all"}
                onValueChange={(v) =>
                  setExtra((prev) => ({ ...prev, [f.key]: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tanlang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barchasi</SelectItem>
                  {f.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Oxirgi arizalar</CardTitle>
            <CardDescription>Yangi tahrirlangan/topshirganlar</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={manageHref}>
              To&apos;liq ro&apos;yxatga o&apos;tish
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Talaba</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Yangilangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latest.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-6">
                    Ma&apos;lumot topilmadi
                  </TableCell>
                </TableRow>
              ) : (
                latest.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {getApplicantName(item.applicant_details) ||
                        item.applicant ||
                        "Noma'lum"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getStatusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDate(item.updated_at, true)}
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

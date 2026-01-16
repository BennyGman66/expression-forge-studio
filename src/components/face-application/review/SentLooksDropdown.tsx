import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, ChevronDown, ExternalLink, AlertCircle, Clock, CheckCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SentLook {
  jobId: string;
  lookId: string;
  lookName: string;
  status: string;
  createdAt: string;
}

interface SentLooksDropdownProps {
  projectId: string;
  sentCount: number;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; priority: number }> = {
  NEEDS_CHANGES: { 
    label: "Needs Changes", 
    icon: <AlertCircle className="h-3 w-3" />, 
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    priority: 1
  },
  SUBMITTED: { 
    label: "Submitted", 
    icon: <Clock className="h-3 w-3" />, 
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    priority: 2
  },
  IN_PROGRESS: { 
    label: "In Progress", 
    icon: <Clock className="h-3 w-3" />, 
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    priority: 3
  },
  ASSIGNED: { 
    label: "Assigned", 
    icon: <Circle className="h-3 w-3" />, 
    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    priority: 4
  },
  OPEN: { 
    label: "Open", 
    icon: <Circle className="h-3 w-3" />, 
    color: "bg-muted text-muted-foreground border-border",
    priority: 5
  },
  APPROVED: { 
    label: "Approved", 
    icon: <CheckCircle className="h-3 w-3" />, 
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    priority: 6
  },
  CLOSED: { 
    label: "Closed", 
    icon: <CheckCircle className="h-3 w-3" />, 
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    priority: 7
  },
};

export function SentLooksDropdown({ projectId, sentCount }: SentLooksDropdownProps) {
  const [sentLooks, setSentLooks] = useState<SentLook[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen && sentLooks.length === 0) {
      fetchSentLooks();
    }
  }, [isOpen]);

  const fetchSentLooks = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("unified_jobs")
        .select(`
          id,
          look_id,
          status,
          created_at,
          talent_looks!inner(look_code)
        `)
        .eq("project_id", projectId)
        .not("look_id", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const looks: SentLook[] = (data || []).map((job: any) => ({
        jobId: job.id,
        lookId: job.look_id,
        lookName: job.talent_looks?.look_code || "Unknown Look",
        status: job.status,
        createdAt: job.created_at,
      }));

      setSentLooks(looks);
    } catch (error) {
      console.error("Failed to fetch sent looks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedByStatus = useMemo(() => {
    const groups: Record<string, SentLook[]> = {};
    
    sentLooks.forEach((look) => {
      if (!groups[look.status]) {
        groups[look.status] = [];
      }
      groups[look.status].push(look);
    });

    // Sort groups by priority
    const sortedStatuses = Object.keys(groups).sort((a, b) => {
      const priorityA = STATUS_CONFIG[a]?.priority ?? 99;
      const priorityB = STATUS_CONFIG[b]?.priority ?? 99;
      return priorityA - priorityB;
    });

    return sortedStatuses.map((status) => ({
      status,
      looks: groups[status],
      config: STATUS_CONFIG[status] || { 
        label: status, 
        icon: <Circle className="h-3 w-3" />, 
        color: "bg-muted text-muted-foreground",
        priority: 99
      },
    }));
  }, [sentLooks]);

  const statusSummary = useMemo(() => {
    const counts: { status: string; count: number; color: string }[] = [];
    
    if (sentLooks.filter(l => l.status === "NEEDS_CHANGES").length > 0) {
      counts.push({ 
        status: "need changes", 
        count: sentLooks.filter(l => l.status === "NEEDS_CHANGES").length,
        color: "text-orange-400"
      });
    }
    if (sentLooks.filter(l => l.status === "SUBMITTED").length > 0) {
      counts.push({ 
        status: "submitted", 
        count: sentLooks.filter(l => l.status === "SUBMITTED").length,
        color: "text-purple-400"
      });
    }
    if (sentLooks.filter(l => l.status === "IN_PROGRESS").length > 0) {
      counts.push({ 
        status: "in progress", 
        count: sentLooks.filter(l => l.status === "IN_PROGRESS").length,
        color: "text-blue-400"
      });
    }
    
    return counts;
  }, [sentLooks]);

  const handleViewJob = (jobId: string) => {
    setIsOpen(false);
    navigate(`/jobs?jobId=${jobId}`);
  };

  const handleViewAll = () => {
    setIsOpen(false);
    navigate(`/jobs?projectId=${projectId}`);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Badge 
          variant="default" 
          className="text-sm bg-blue-600 hover:bg-blue-700 cursor-pointer transition-colors flex items-center gap-1"
        >
          <Send className="h-3 w-3" />
          {sentCount} sent
          <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="p-3 border-b border-border">
          <h4 className="font-semibold text-sm">Sent to Job Board</h4>
          {statusSummary.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              {statusSummary.map(({ status, count, color }) => (
                <span key={status} className={color}>
                  {count} {status}
                </span>
              ))}
            </div>
          )}
        </div>

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Loading...
            </div>
          ) : groupedByStatus.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No looks sent yet
            </div>
          ) : (
            <div className="p-2">
              {groupedByStatus.map(({ status, looks, config }) => (
                <div key={status} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {config.icon}
                    {config.label} ({looks.length})
                  </div>
                  <div className="space-y-1">
                    {looks.map((look) => (
                      <div
                        key={look.jobId}
                        className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50 group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs truncate">
                            {look.lookName}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleViewJob(look.jobId)}
                        >
                          View
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={handleViewAll}
          >
            View All on Job Board
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

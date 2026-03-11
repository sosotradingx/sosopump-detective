import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Flame, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PageNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-6">
        <div className="w-16 h-16 mx-auto bg-primary/20 rounded-2xl flex items-center justify-center">
          <Flame className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-4xl font-bold font-mono text-primary">404</h1>
          <p className="text-muted-foreground mt-2">Pagina nu a fost găsită</p>
        </div>
        <Link to={createPageUrl("Dashboard")}>
          <Button className="bg-primary hover:bg-primary/90">
            <ArrowLeft className="w-4 h-4 mr-2" /> Înapoi la Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
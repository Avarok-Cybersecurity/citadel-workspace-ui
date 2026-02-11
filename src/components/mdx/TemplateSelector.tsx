import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, FileText } from 'lucide-react';
import { getEntityMetadata } from '@/lib/entity-type-registry';

import {
  TemplateCategory,
  MdxTemplate,
  getTemplatesByCategory
} from '@/lib/mdx-templates';

interface TemplateSelectorProps {
  category: TemplateCategory;
  onSelectTemplate: (template: MdxTemplate) => void;
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  buttonText?: string;
}

/** Map TemplateCategory to entity type string for registry lookup */
function categoryToEntityType(category: TemplateCategory): string {
  // TemplateCategory values are lowercase ('office', 'room')
  // Registry keys are capitalized ('Office', 'Room')
  return category.charAt(0).toUpperCase() + category.slice(1);
}

const TemplateSelector = ({
  category,
  onSelectTemplate,
  buttonVariant = 'default',
  buttonSize = 'default',
  buttonText = 'Select Template'
}: TemplateSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MdxTemplate | null>(null);
  const [templates, setTemplates] = useState<MdxTemplate[]>([]);

  // Fetch templates by category when opened
  useEffect(() => {
    if (open) {
      const categoryTemplates = getTemplatesByCategory(category);
      setTemplates(categoryTemplates);
      setSelectedTemplate(null);
    }
  }, [open, category]);

  const handleSelectTemplate = () => {
    if (selectedTemplate) {
      onSelectTemplate(selectedTemplate);
      setOpen(false);
    }
  };

  // Derive icon and label from entity-type-registry (SSOT)
  const entityType = categoryToEntityType(category);
  const metadata = getEntityMetadata(entityType);
  const CategoryIcon = metadata.icon;
  const categoryLabel = metadata.label;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          className="gap-2"
        >
          <FileText size={16} />
          {buttonText}
        </Button>
      </DialogTrigger>

      <DialogContent className="w-full max-w-3xl bg-[#343A5C] text-white border-purple-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CategoryIcon className="h-[18px] w-[18px]" />
            {categoryLabel} Templates
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Choose a template to start with pre-configured content tailored for specific {category.toLowerCase()} types.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Tabs defaultValue="gallery" className="w-full">
            <TabsList className="grid grid-cols-2 mb-4 bg-[#444A6C]">
              <TabsTrigger value="gallery" className="data-[state=active]:bg-[#262C4A] data-[state=active]:text-white">
                Gallery View
              </TabsTrigger>
              <TabsTrigger value="list" className="data-[state=active]:bg-[#262C4A] data-[state=active]:text-white">
                List View
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gallery" className="mt-0">
              <ScrollArea className="h-[400px] pr-4">
                <div className="grid grid-cols-2 gap-4">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className={`relative rounded-md overflow-hidden border-2 transition-all cursor-pointer
                        ${selectedTemplate?.id === template.id
                          ? 'border-purple-500 shadow-lg shadow-purple-900/30'
                          : 'border-gray-700 hover:border-gray-500'
                        }`}
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <div className="absolute top-2 right-2 z-10">
                        {selectedTemplate?.id === template.id && (
                          <div className="rounded-full bg-purple-500 p-1">
                            <Check size={16} />
                          </div>
                        )}
                      </div>

                      <div className="h-32 bg-[#262C4A] flex items-center justify-center">
                        {template.thumbnail ? (
                          <img
                            src={template.thumbnail}
                            alt={template.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-gray-400">
                            <CategoryIcon className="h-12 w-12" />
                            <span className="text-xs mt-2">{template.type.toString().replace('_', ' ')}</span>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-sm">{template.name}</h3>
                        <p className="text-xs text-gray-400 mt-1">{template.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="list" className="mt-0">
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className={`flex items-start p-3 rounded-md transition-all cursor-pointer
                        ${selectedTemplate?.id === template.id
                          ? 'bg-purple-900/30 border-l-4 border-purple-500'
                          : 'hover:bg-[#444A6C]'
                        }`}
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <div className="mr-3 mt-1">
                        <CategoryIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-sm">{template.name}</h3>
                        <p className="text-xs text-gray-400 mt-1">{template.description}</p>
                      </div>
                      {selectedTemplate?.id === template.id && (
                        <div className="rounded-full bg-purple-500 p-1 ml-2">
                          <Check size={16} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="border-gray-700 text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSelectTemplate}
            disabled={!selectedTemplate}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateSelector;

/**
 * Created by eddyspreeuwers on 1/5/20.
 */
import {capFirst, attribs, findFirstChild, xml, log, findNextSibbling, getFieldType} from './xml-utils';

const UNBOUNDED = 'unbounded';


export type FindNextNode = (n: Node) => Node;
export type AstNodeFactory = (n: Node) => ASTNode;
export type AstNodeMerger = (r1: ASTNode, r2: ASTNode) => ASTNode;

const returnMergedResult: AstNodeMerger  = (r1, r2) => r1.merge(r2);
let ns = 'xs';

export function setNamespace(namespace: string) {
    ns = namespace;
}
export function astNode(s:string) {
    return new ASTNode(s);
}

export function astClass(n?: Node) {
    let result = astNode('Class');
    if (n) result.addName(n);
    return result;
}

export function astEnum(n:Node) {
    return astNode('Enum').named(attribs(n).name);
}

export function astEnumValue(n: Node){
    return astNode('EnumValue').prop('value', attribs(n).value);
}

export function astField() {
    return astNode('Class');
}


export function oneOf(...options: Parslet[]){
    return new OneOf('ONE OFF' , options);
}


export function match(t: Terminal, m?: AstNodeMerger) {
    return new Matcher('MATCH' , t, m);
}

export interface IParsable {
    parse(node: Node, indent?: string): ASTNode;
}


export class ASTNode {
    public nodeType: string;
    public name: string;
    public child: ASTNode;
    public list: ASTNode[];

    constructor(type: string){
        this.nodeType = type;
    }

    public prop(key: string, value: any) {
        this[key] = value;
        return this;
    }

    public named(name:string): ASTNode {
        this.name = name;
        return this;
    }

    public capNamed(name: string): ASTNode {
        this.name = capFirst(name);
        return this;
    }


    public addFields(n:Node): ASTNode {
        return this.prop('fields', [{nodeType: 'Field' , fieldName: attribs(n).name, fieldType: attribs(n).type }]);
    }


    public addName(node: Node, prefix?: string): ASTNode{
        return this.prop('name', (prefix || '') + capFirst(attribs(node).name));
    }

    public addField(node: Node) {

        let type = getFieldType(attribs(node).type);

        this.prop('fieldName', attribs(node).name + ((attribs(node).minOccurs === '0') ? '?' : ''))
            .prop('fieldType', type + ((attribs(node).maxOccurs === UNBOUNDED) ? '[]' : ''));
        return this;
    }

    get obj(): any {
        return this as any;
    }
    public merge (other: ASTNode){
        let result = new ASTNode(this.nodeType);
        result =  (Object as any).assign(result, this);
        result =  (Object as any).assign(result, other);
        result.nodeType = this.nodeType;
        return result;
    }

}

export class ASTClass extends ASTNode {


    constructor(n: Node) {
        super ("Class");
        this.addName(n);
    }

    get nodeType(){
        return 'Class;';
    }

    public static fromNamedElement(n:Node): ASTClass {
        return new ASTClass(n);
    }
}

export abstract class Parslet implements IParsable {
    public name: string;
    public fnNextNode: FindNextNode;
    public nextParslet: Parslet;

    constructor(name: string) {
        this.name = name;
        this.fnNextNode = x => x;
    }

    public abstract parse(node: Node, indent?: string): ASTNode;

    // Add child at and of child chain recursively
    public addNext(p: Parslet, fnn: FindNextNode) {
        if (this.nextParslet) {
            this.nextParslet.addNext(p, fnn);
        } else {
            this.nextParslet = p;
            this.fnNextNode = fnn;
        }
        return this;
    }

    public children(...options: Parslet[]) {
        const next = new Sibblings(this.name, options);
        this.addNext(next, findFirstChild);
        return this;
    }


    public child(t: Terminal, m?: AstNodeMerger) {
        const next = new Matcher('MATCH' , t, m);
        this.addNext(next, findFirstChild);
        return this;
    }


    public match(t: Terminal, m?: AstNodeMerger) {
        const next = new Matcher('MATCH' , t, m);
        this.addNext(next, n => n);
        return this;
    }

    public oneOf(...options: Parslet[]){
        const next = new OneOf('ONE OFF' , options);
        this.addNext(next, (n) => n);
        return this;
    }

    public childIsOneOf(...options: Parslet[]) {
        const next = new OneOf('ONE OFF' , options);
        this.addNext(next, findFirstChild);
        return this;
    }


}

export class Terminal implements IParsable {
    public name:string;
    public tagName: string;

    private astNodeFactory = (n) => new ASTNode(this.tagName);

    constructor(name: string, handler?: AstNodeFactory) {
        this.name = name;
        this.tagName = name.split(':').shift();

        this.astNodeFactory = handler || this.astNodeFactory;
    }


    public parse(node: Node, indent?: string): ASTNode {
        let result = null;
        const isElement = xml(node)?.localName === this.tagName;
        log(indent + 'Terminal: ', this.name +  ', node: ', node?.nodeName, 'found: ', isElement);
        if (isElement) {
            result =  this.astNodeFactory(node);
        }
        return result;
    }


}

export class Proxy extends Parslet {

    public parsable: Parslet;

    constructor(name: string) {
        super(name);

    }
    set parslet(p: Parslet) {
        this.parsable = p;
    }

    public parse(node: Node, indent?: string): ASTNode {
        return this.parsable.parse(node, indent + ' ');
    }
}



export class Matcher extends Parslet {
    private terminal: Terminal;
    private merger: AstNodeMerger = returnMergedResult;


    constructor(name: string, t: Terminal, m?: AstNodeMerger) {
        super(name);
        this.merger = m || this.merger;
        this.terminal = t;

    }

    public parse(node: Node, indent?: string): ASTNode {
        let sibbling = node;
        let result: ASTNode;

        //find the first sibbling matching the terminal
        while (sibbling){
            let skip = /(annotation|documentation)/.test(xml(node)?.localName);
            if (!skip) break;
            sibbling = findNextSibbling(sibbling);
        }
        result  = this.terminal.parse(sibbling, indent + ' ');

        log(indent, this.name, this.terminal.tagName, 'node: ', node?.nodeName, 'match:', JSON.stringify(result));

        if (result && this.nextParslet) {
            const nextResult =  this.nextParslet.parse(this.fnNextNode(sibbling), indent + ' ');
            if (nextResult) {
                result = this.merger(result, nextResult);
            } else {
                log(indent,'no next result' ,this.name);
                result = null;
            }
        }
        log(indent, this.name, 'result: ', JSON.stringify(result));
        return result;
    }


}

export class OneOf extends Parslet {

    public options: Parslet[];

    constructor(name: string, options: Parslet[]) {
        super(name);
        this.options = options;
    }

    public parse(node: Node, indent?: string): ASTNode {
        const nextNode = this.fnNextNode(node);
        log(indent + 'ONE OFF:', this.options.map(o => o.name).join(','), node?.nodeName, nextNode?.nodeName);
        let result = null;
        let count = 1;
        for (let option of this.options || []) {
            log(indent + ' try:', option.name , '#' , count++);
            result = option.parse(nextNode, indent + '  ');
            if (result) {
                break;
            }
        }
        return result;
    }
}

export class Sibblings extends Parslet {

    //public parsable: Parslet;
    public options: Parslet[];

    constructor(name: string, options: Parslet[]) {
        super(name);
        this.options = options;
    }

    public parse(node: Node, indent?: string): ASTNode{

        log(indent + 'Collect all :', this.options.map(x => x.name).join(','), node.nodeName);
        let sibbling = node;

        const result = new ASTNode("Sibblings");
        result.list = [];

        while (sibbling) {
            log(indent + 'list sibbling:', sibbling?.nodeName);

            //const listItem = this.parsable.parse(sibbling, indent + '  ');
            let listItem = null;
            let count = 0;
            for (let option of this.options || []) {
                log(indent + ' try:', option.name , '#' , count++);
                listItem = option.parse(sibbling, indent + '  ');
                if (listItem) {
                    break;
                }
            }

            if (listItem) {
                result.list.push(listItem);
            }
            sibbling = findNextSibbling(sibbling);

        }
        return result;
    }
}




